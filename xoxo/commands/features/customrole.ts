// xoxo/commands/features/customrole.ts
//
// $customrole — server-specific role-assignment shortcuts.
//
// Administrators link one keyword to up to 5 roles. A single guild-wide access
// role, configured with `customrole access <role>`, controls who can use every
// keyword. Members with that role can type `<prefix><keyword> <user1> <user2> …`
// and the bot instantly gives those roles to resolved members (up to 10).
//
// Subcommands:
//   create <keyword> <@role(s)>       — register a keyword (max 15 per guild)
//   access <@role>                    — set the access role for all keywords
//   delete <keyword>                  — remove a keyword
//   list                              — show all keywords in this server
//   info   <keyword>                  — show which roles are linked
//   add    <keyword> <@role(s)>       — link more roles to an existing keyword (max 5 total)
//   remove <keyword> <@role(s)>       — unlink specific roles from a keyword
//
// Does NOT work with noprefix. Dispatch lives in helpers/customRoleDispatch.ts.

import type { LevitateClient }           from '../../structures/LevitateClient.js';
import { PermissionFlagsBits }           from 'discord.js';
import { sendError, sendSuccess, sendInfo } from '../../components/statusMessages.js';
import { Database }                      from '../../database/database.js';
import { resolveRole }                   from '../../helpers/roleResolver.js';

export const options = {
  name:        'customrole',
  aliases:     ['cr', 'crole'] as string[],
  description: 'Create server-specific role-assignment shortcuts. Link keywords to up to 5 roles and set one server-wide access role for all custom roles.',
  usage:       [
    'customrole create <keyword> <@role> [@role2 …]',
    'customrole access <@role>',
    'customrole delete <keyword>',
    'customrole list',
    'customrole info <keyword>',
    'customrole add <keyword> <@role> [@role2 …]',
    'customrole remove <keyword> <@role> [@role2 …]',
  ].join('\n'),
  category: 'features',
  owner:    false,
  cooldown: 3,
};

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_KEYWORD_LEN = 32;
const KEYWORD_RE      = /^[a-z0-9_-]+$/; // lowercase, digits, hyphen, underscore

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse role IDs from role mentions + any raw 17-20 digit IDs in args. */
function parseRoleIds(message: any, args: string[]): string[] {
  const ids: string[] = [];
  const seen = new Set(ids);
  const rawId = /^\d{17,20}$/;
  for (const arg of args) {
    const stripped = arg.replace(/^<@&/, '').replace(/>$/, '');
    const role = message.guild.roles.cache.get(stripped);
    if ((rawId.test(stripped) || /^<@&\d{17,20}>$/.test(arg)) && role && !seen.has(role.id)) {
      ids.push(role.id);
      seen.add(role.id);
    }
  }
  return ids;
}

/** Resolve and validate roles: exist in guild, not @everyone, not managed. */
function resolveValidRoles(guild: any, roleIds: string[]): { valid: any[]; invalid: string[] } {
  const valid: any[]    = [];
  const invalid: string[] = [];
  for (const id of roleIds) {
    const role = guild.roles.cache.get(id);
    if (!role || role.id === guild.id || role.managed) {
      invalid.push(id);
    } else {
      valid.push(role);
    }
  }
  return { valid, invalid };
}

/** Management is restricted to server owners and members with Administrator. */
async function requireAdministrator(message: any): Promise<boolean> {
  const invoker = message.member;
  const isOwner = message.guild?.ownerId === message.author?.id;
  if (!isOwner && !invoker?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
    await sendError({ message }, 'You need the **Administrator** permission to manage custom roles.');
    return false;
  }
  return true;
}

/** The bot still needs Manage Roles to create or change member roles. */
async function requireBotManageRoles(message: any): Promise<boolean> {
  const bot = message.guild.members.me;
  if (!bot?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    await sendError({ message }, 'I need the **Manage Roles** permission to use this feature.');
    return false;
  }
  return true;
}

// ── Subcommand handlers ──────────────────────────────────────────────────────

async function handleAccess(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<void> {
  if (!await requireAdministrator(message)) return;

  const input = args.join(' ').trim();
  if (!input) {
    await sendError({ message }, 'Provide the server-wide access role. Usage: `customrole access <@role>`');
    return;
  }

  const accessRole = resolveRole(message.guild, input);
  if (!accessRole || accessRole.id === message.guild.id || accessRole.managed) {
    await sendError({ message }, 'The access role must be a valid, non-managed server role (not @everyone).');
    return;
  }

  await client.db!.setCustomRoleAccessRole(message.guild.id, accessRole.id);
  await sendSuccess(
    { message },
    `Set <@&${accessRole.id}> as the access role for **all** custom roles in this server.`,
  );
}

async function handleCreate(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<void> {
  if (!await requireAdministrator(message)) return;
  if (!await requireBotManageRoles(message)) return;

  const keyword = args[0]?.toLowerCase();
  if (!keyword) {
    await sendError({ message }, 'Provide a keyword. Usage: `customrole create <keyword> <@role(s)>`');
    return;
  }
  if (!KEYWORD_RE.test(keyword)) {
    await sendError({ message }, 'Keywords can only contain letters, digits, hyphens, and underscores — no spaces.');
    return;
  }
  if (keyword.length > MAX_KEYWORD_LEN) {
    await sendError({ message }, `Keyword is too long (max ${MAX_KEYWORD_LEN} characters).`);
    return;
  }

  // Block shadowing real bot commands or aliases
  const isRealCmd = client.commands.has(keyword) || !!client.aliases.get(keyword);
  if (isRealCmd) {
    await sendError({ message }, `\`${keyword}\` is already a bot command — choose a different keyword.`);
    return;
  }

  const roleIds = parseRoleIds(message, args.slice(1));
  if (roleIds.length === 0) {
    await sendError({ message }, 'Mention at least one role to link. Usage: `customrole create <keyword> <@role(s)>`');
    return;
  }

  const { valid, invalid } = resolveValidRoles(message.guild, roleIds);
  if (valid.length === 0) {
    await sendError({ message }, 'None of the provided roles are valid. Bot-managed and @everyone roles cannot be linked.');
    return;
  }

  const capped = valid.slice(0, Database.CUSTOM_ROLE_MAX_ROLES);
  const result = await client.db!.createCustomRole(
    message.guild.id,
    keyword,
    capped.map((r: any) => r.id),
    message.author.id,
  );
  const accessRoleId = await client.db!.getCustomRoleAccessRoleId(message.guild.id);
  const usageNote = accessRoleId
    ? `-# Targets accept user mentions, user IDs, or usernames and require <@&${accessRoleId}>. Doesn't work with noprefix.`
    : '-# Targets accept user mentions, user IDs, or usernames. Set the server-wide access role with `customrole access <@role>` before using this keyword. Doesn\'t work with noprefix.';

  if (result === 'exists') {
    await sendError({ message }, `A custom role keyword \`${keyword}\` already exists. Use \`customrole add ${keyword}\` to link more roles.`);
    return;
  }
  if (result === 'limit') {
    await sendError({ message }, `This server has reached the limit of **${Database.CUSTOM_ROLE_MAX_PER_GUILD}** custom role keywords.`);
    return;
  }

  const roleList = capped.map((r: any) => `<@&${r.id}>`).join(', ');
  let   reply    = `Created custom role keyword \`${keyword}\` → ${roleList}.`;
  if (valid.length > capped.length) {
    reply += `\n-# Only the first ${Database.CUSTOM_ROLE_MAX_ROLES} roles were linked (max per keyword).`;
  }
  if (invalid.length > 0) {
    reply += `\n-# ${invalid.length} invalid/managed role(s) were skipped.`;
  }
  reply += `\n${usageNote}`;

  await sendSuccess({ message }, reply);
}

async function handleDelete(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<void> {
   if (!await requireAdministrator(message)) return;
   if (!await requireBotManageRoles(message)) return;

  const keyword = args[0]?.toLowerCase();
  if (!keyword) {
    await sendError({ message }, 'Provide a keyword to delete. Usage: `customrole delete <keyword>`');
    return;
  }

  const deleted = await client.db!.deleteCustomRole(message.guild.id, keyword);
  if (!deleted) {
    await sendError({ message }, `No custom role keyword \`${keyword}\` found in this server.`);
    return;
  }
  await sendSuccess({ message }, `Deleted custom role keyword \`${keyword}\`.`);
}

async function handleList(
  message: any,
  client:  LevitateClient,
): Promise<void> {
  if (!await requireAdministrator(message)) return;
  const docs = await client.db!.getCustomRoles(message.guild.id);
  if (docs.length === 0) {
        await sendInfo({ message }, 'No custom role keywords set up yet. Use `customrole create <keyword> <@role(s)>` to create one.');
    return;
  }

  const accessRoleId = await client.db!.getCustomRoleAccessRoleId(message.guild.id);
  const accessRole = accessRoleId ? message.guild.roles.cache.get(accessRoleId) : null;
  const lines: string[] = docs.map((doc, i) => {
    const roleList = doc.role_ids
      .map((id: string) => {
        const r = message.guild.roles.cache.get(id);
        return r ? `<@&${r.id}>` : `~~${id}~~`;
      })
      .join(', ');
    return `**${i + 1}.** \`${doc.keyword}\` → ${roleList}`;
  });

  await sendInfo(
    { message },
    `**Custom Roles** (${docs.length}/${Database.CUSTOM_ROLE_MAX_PER_GUILD})\nAccess role for all: ${accessRole ? `<@&${accessRole.id}>` : 'not configured'}\n${lines.join('\n')}`,
  );
}

async function handleInfo(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<void> {
  if (!await requireAdministrator(message)) return;
  const keyword = args[0]?.toLowerCase();
  if (!keyword) {
    await sendError({ message }, 'Provide a keyword. Usage: `customrole info <keyword>`');
    return;
  }

  const doc = await client.db!.getCustomRole(message.guild.id, keyword);
  if (!doc) {
    await sendError({ message }, `No custom role keyword \`${keyword}\` found in this server.`);
    return;
  }

  const roleLines = doc.role_ids.map((id: string) => {
    const r = message.guild.roles.cache.get(id);
    return r ? `• <@&${r.id}> (\`${r.name}\`)` : `• ~~${id}~~ (role deleted)`;
  });

  const creator = await message.guild.members.fetch(doc.created_by).catch((): null => null);
  const createdBy = creator ? `<@${doc.created_by}>` : `\`${doc.created_by}\``;
  const createdAt = `<t:${Math.floor(new Date(doc.created_at).getTime() / 1000)}:R>`;
  const accessRoleId = await client.db!.getCustomRoleAccessRoleId(message.guild.id);
  const accessRole = accessRoleId ? message.guild.roles.cache.get(accessRoleId) : null;
  const access = accessRole ? `<@&${accessRole.id}> (\`${accessRole.name}\`)` : 'not configured';

  await sendInfo(
    { message },
    [
      `**Custom Role — \`${doc.keyword}\`**`,
      `Roles linked: **${doc.role_ids.length}**/${Database.CUSTOM_ROLE_MAX_ROLES}`,
      roleLines.join('\n'),
      `Server-wide access role: ${access}`,
      `Created by ${createdBy} ${createdAt}`,
      `-# Usage: \`<prefix>${doc.keyword} <@user|user-id|username> …\` or \`<prefix>${doc.keyword} remove <@user|user-id|username> …\` (requires the server-wide access role, max 10 users)`,
    ].join('\n'),
  );
}

async function handleAdd(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<void> {
  if (!await requireAdministrator(message)) return;
  if (!await requireBotManageRoles(message)) return;

  const keyword = args[0]?.toLowerCase();
  if (!keyword) {
    await sendError({ message }, 'Provide a keyword and roles. Usage: `customrole add <keyword> <@role(s)>`');
    return;
  }

  const doc = await client.db!.getCustomRole(message.guild.id, keyword);
  if (!doc) {
    await sendError({ message }, `No custom role keyword \`${keyword}\` found. Create it first with \`customrole create\`.`);
    return;
  }

  const newIds = parseRoleIds(message, args.slice(1));
  if (newIds.length === 0) {
    await sendError({ message }, 'Mention at least one role to add.');
    return;
  }

  const existingSet = new Set(doc.role_ids);
  const toAdd: string[] = [];
  const skippedDupe: string[] = [];

  for (const id of newIds) {
    if (existingSet.has(id)) skippedDupe.push(id);
    else toAdd.push(id);
  }

  const { valid, invalid } = resolveValidRoles(message.guild, toAdd);
  const merged = [...doc.role_ids, ...valid.map((r: any) => r.id)];

  if (merged.length > Database.CUSTOM_ROLE_MAX_ROLES) {
    const canAdd = Database.CUSTOM_ROLE_MAX_ROLES - doc.role_ids.length;
    if (canAdd <= 0) {
      await sendError(
        { message },
        `\`${keyword}\` already has ${Database.CUSTOM_ROLE_MAX_ROLES} roles linked (the maximum). Remove one first.`,
      );
      return;
    }
  }

  const finalRoles = [...doc.role_ids, ...valid.map((r: any) => r.id)].slice(0, Database.CUSTOM_ROLE_MAX_ROLES);
  const updated = await client.db!.setCustomRoleRoles(message.guild.id, keyword, finalRoles);
  if (!updated) {
    await sendError({ message }, 'Failed to update — keyword may have been deleted concurrently.');
    return;
  }

  const addedList = valid.slice(0, Database.CUSTOM_ROLE_MAX_ROLES - doc.role_ids.length)
    .map((r: any) => `<@&${r.id}>`).join(', ');
  let reply = `Added ${addedList} to \`${keyword}\`. It now has **${finalRoles.length}**/${Database.CUSTOM_ROLE_MAX_ROLES} role(s) linked.`;
  if (skippedDupe.length) reply += `\n-# ${skippedDupe.length} role(s) were already linked and skipped.`;
  if (invalid.length)     reply += `\n-# ${invalid.length} invalid/managed role(s) were skipped.`;

  await sendSuccess({ message }, reply);
}

async function handleRemove(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<void> {
  if (!await requireAdministrator(message)) return;
  if (!await requireBotManageRoles(message)) return;

  const keyword = args[0]?.toLowerCase();
  if (!keyword) {
    await sendError({ message }, 'Provide a keyword and roles. Usage: `customrole remove <keyword> <@role(s)>`');
    return;
  }

  const doc = await client.db!.getCustomRole(message.guild.id, keyword);
  if (!doc) {
    await sendError({ message }, `No custom role keyword \`${keyword}\` found.`);
    return;
  }

  const toRemove = new Set(parseRoleIds(message, args.slice(1)));
  if (toRemove.size === 0) {
    await sendError({ message }, 'Mention at least one role to remove.');
    return;
  }

  const remaining = doc.role_ids.filter((id: string) => !toRemove.has(id));

  if (remaining.length === doc.role_ids.length) {
    await sendError({ message }, 'None of the mentioned roles are linked to this keyword.');
    return;
  }

  if (remaining.length === 0) {
    // Last role removed — delete the whole keyword
    await client.db!.deleteCustomRole(message.guild.id, keyword);
    await sendSuccess({ message }, `Removed the last role from \`${keyword}\` — the keyword has been deleted entirely since it had no remaining roles.`);
    return;
  }

  await client.db!.setCustomRoleRoles(message.guild.id, keyword, remaining);
  const removedCount = doc.role_ids.length - remaining.length;
  await sendSuccess(
    { message },
    `Removed **${removedCount}** role(s) from \`${keyword}\`. It now has **${remaining.length}**/${Database.CUSTOM_ROLE_MAX_ROLES} linked.`,
  );
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<void> {
  if (!message.guild) {
    await sendError({ message }, 'This command can only be used in a server.');
    return;
  }
  if (!client.db) {
    await sendError({ message }, 'Database is unavailable. Try again shortly.');
    return;
  }

  if (!await requireAdministrator(message)) return;

  const sub = args[0]?.toLowerCase();

  switch (sub) {
    case 'create': return handleCreate(message, args.slice(1), client);
    case 'access': return handleAccess(message, args.slice(1), client);
    case 'delete': return handleDelete(message, args.slice(1), client);
    case 'list':   return handleList(message, client);
    case 'info':   return handleInfo(message, args.slice(1), client);
    case 'add':    return handleAdd(message, args.slice(1), client);
    case 'remove': return handleRemove(message, args.slice(1), client);

    default:
      await sendInfo(
        { message },
        [
          '**Custom Roles — Subcommands**',
          '`customrole create <keyword> <@role(s)>` — link a keyword to up to 5 roles',
          '`customrole access <@role>` — set the access role for all custom roles in this server',
          '`customrole delete <keyword>` — remove a keyword',
          '`customrole list` — show all keywords and the server-wide access role',
          '`customrole info <keyword>` — show linked roles and the server-wide access role',
          '`customrole add <keyword> <@role(s)>` — add more roles to an existing keyword',
          '`customrole remove <keyword> <@role(s)>` — unlink specific roles',
          '`customrole <keyword> <mention|user-id|username> …` — assign linked roles to users',
          '`customrole <keyword> remove <mention|user-id|username> …` — remove linked roles from users',
          `-# Requires **Administrator** to manage keywords and set access. Keyword use requires the server-wide access role; the server owner always has access.`,
        ].join('\n'),
      );
  }
}
