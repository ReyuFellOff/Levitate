import { config } from '../../config.js';
// xoxo/commands/welcomer/birthday.ts
//
// $birthday — set your birthday, view everyone's birthday in this server, and
// (admins) configure the birthday announcement channel + message.
//
// Usage:
//   $birthday                                  → show settings + your own birthday
//   $birthday set <date>                       → set your birthday (multiple date formats)
//   $birthday unset                            → remove your birthday
//   $birthday list                             → list birthdays of members in this server
//   $birthday channel set <#channel | id>      → set the announcement channel (ManageGuild)
//   $birthday channel remove                   → remove the announcement channel (ManageGuild)
//   $birthday message set <text> [data: <name>]→ set the announcement message (ManageGuild)
//   $birthday message remove                   → reset the announcement message to default (ManageGuild)
//
// A birthday is global to a user — one date, shared across every server the
// bot is in — but the announcement channel/message are configured per server.

import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { parseSayText } from '../../helpers/emojiParser.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';
import { parseBirthdayDate, formatBirthday } from '../../helpers/parseBirthdayDate.js';
import {
  buildBirthdaySettingsContainer,
  buildBirthdayListContainer,
  type BirthdayListEntry,
} from '../../components/birthday/birthday.js';

export const options = {
  name:        'birthday',
  aliases:     ['bday', 'bd'] as string[],
  description: 'Set your birthday, view server birthdays, and configure birthday announcements.',
  usage: `birthday
birthday set <date>
birthday unset
birthday list
birthday channel set <#channel> | remove
birthday message set <text> [data: <saved-data-name>] | remove`,
  category: 'features',
  owner:    false,
  cooldown: 3,
};

const MESSAGE_LIMIT = 1500;

function resolveTextChannel(guild: any, arg: string): any | null {
  const idMatch = arg.match(/^<#(\d+)>$/) ?? arg.match(/^(\d{17,20})$/);
  if (!idMatch) return null;
  const ch = guild.channels.cache.get(idMatch[1]);
  if (!ch) return null;
  return (
    ch.type === ChannelType.GuildText ||
    ch.type === ChannelType.GuildAnnouncement ||
    (ch.isTextBased?.() && !ch.isVoiceBased?.())
  ) ? ch : null;
}

function parseMessageInput(raw: string): { text: string | null; dataName: string | null } {
  const match = raw.match(/^([\s\S]*?)\s*\[data:\s*([^\]]+)\]\s*$/i);
  if (match) return { text: match[1].trim() || null, dataName: match[2].trim() || null };
  return { text: raw.trim() || null, dataName: null };
}

function hasManageGuild(message: any): boolean {
  return !!message.channel.permissionsFor?.(message.member)?.has?.(PermissionFlagsBits.ManageGuild);
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx    = { message };
  const prefix = client.config.prefix;

  if (!client.db) return sendError(ctx, 'Database is unavailable.');

  const action = args[0]?.toLowerCase();

  // ── $birthday set <date> ────────────────────────────────────────────────
  if (action === 'set') {
    const raw = args.slice(1).join(' ').trim();
    if (!raw) {
      return sendError(
        ctx,
        `Provide your birthday date.\n-# Examples: \`${prefix}birthday set 15/04\`, \`${prefix}birthday set April 15\`, \`${prefix}birthday set 2000-04-15\``,
      );
    }

    const parsed = parseBirthdayDate(raw);
    if (!parsed) {
      return sendError(
        ctx,
        `Could not understand that date.\n-# Try formats like \`15/04\`, \`15-04-2000\`, \`April 15\`, or \`2000-04-15\`.`,
      );
    }

    await client.db.setBirthday(message.author.id, parsed.day, parsed.month, parsed.year);
    return sendSuccess(ctx, `Your birthday has been set to **${formatBirthday(parsed.day, parsed.month, parsed.year)}**.`);
  }

  // ── $birthday unset ──────────────────────────────────────────────────────
  if (action === 'unset' || action === 'remove') {
    const existing = await client.db.getBirthday(message.author.id).catch((): null => null);
    if (!existing) return sendError(ctx, 'You have not set a birthday yet.');

    await client.db.removeBirthday(message.author.id);
    return sendSuccess(ctx, 'Your birthday has been removed.');
  }

  // ── $birthday list ───────────────────────────────────────────────────────
  if (action === 'list') {
    if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

    let members: any;
    try {
      members = await message.guild.members.fetch();
    } catch {
      members = message.guild.members.cache;
    }

    const memberIds: string[] = [...members.keys()];
    const birthdays: BirthdayListEntry[] = await client.db.getBirthdaysForUsers(memberIds).catch((): any[] => []);

    const container = buildBirthdayListContainer(message.guild, birthdays);
    return message.channel.send({
      components:      [container],
      flags:           MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
  }

  // ── $birthday channel set|remove ─────────────────────────────────────────
  if (action === 'channel') {
    if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');
    if (!hasManageGuild(message)) return sendError(ctx, 'You need the **Manage Server** permission to use this command.');

    const sub = args[1]?.toLowerCase();

    if (sub === 'set') {
      const raw = args[2];
      if (!raw) return sendError(ctx, `Provide a channel mention or ID.\n-# Example: \`${prefix}birthday channel set #birthdays\``);

      const ch = resolveTextChannel(message.guild, raw);
      if (!ch) return sendError(ctx, 'Could not find a text channel with that mention or ID in this server.');

      await client.db.setBirthdayChannel(message.guild.id, ch.id);
      return sendSuccess(ctx, `Birthday channel set to <#${ch.id}>. Birthdays will be announced there.`);
    }

    if (sub === 'remove') {
      await client.db.setBirthdayChannel(message.guild.id, null);
      return sendSuccess(ctx, 'Birthday channel removed. Birthday announcements are now disabled.');
    }

    return sendError(
      ctx,
      `**Usage:**\n\`${prefix}birthday channel set <#channel>\`\n\`${prefix}birthday channel remove\``,
    );
  }

  // ── $birthday message set|remove ─────────────────────────────────────────
  if (action === 'message') {
    if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');
    if (!hasManageGuild(message)) return sendError(ctx, 'You need the **Manage Server** permission to use this command.');

    const sub = args[1]?.toLowerCase();

    if (sub === 'set') {
      const raw = args.slice(2).join(' ');
      if (!raw.trim()) {
        return sendError(
          ctx,
          `Provide the message text after \`set\`.\n-# Example: \`${prefix}birthday message set Happy Birthday, \${user_mention}!\`\n-# Append \`[data: <name>]\` to also send a saved embed or CV2.`,
        );
      }

      const { text, dataName } = parseMessageInput(raw);

      if (!text && !dataName)
        return sendError(ctx, 'Could not parse the message. Make sure you have some text or a `[data: <name>]` tag.');

      if (text && text.length > MESSAGE_LIMIT)
        return sendError(ctx, `Message text is too long (**${text.length}** chars). Maximum is **${MESSAGE_LIMIT}** characters.`);

      let parsedText = text;
      if (parsedText) {
        const { text: resolvedText, invalid } = await parseSayText(
          parsedText,
          (id) => resolveEmoji(client, id, message.guild),
        );
        if (invalid.length) {
          return sendError(ctx, `Could not resolve emoji: ${invalid.map((i) => `\`${i}\``).join(', ')}`);
        }
        parsedText = resolvedText;
      }

      if (dataName) {
        const exists = await client.db.savedDataNameExists(message.guild.id, dataName).catch((): boolean => false);
        if (!exists) {
          return sendError(
            ctx,
            `No saved data named \`${dataName}\` found in this server.\n-# Check spelling, or run \`${prefix}view-data\` to list saved entries.`,
          );
        }
      }

      await client.db.setBirthdayMessage(message.guild.id, parsedText ?? null, dataName ?? null);

      const parts: string[] = [];
      if (parsedText) parts.push(`text: \`${parsedText.slice(0, 60)}${parsedText.length > 60 ? '…' : ''}\``);
      if (dataName)   parts.push(`saved data: \`${dataName}\``);

      return sendSuccess(ctx, `Birthday message set — ${parts.join(' + ')}.`);
    }

    if (sub === 'remove') {
      await client.db.setBirthdayMessage(message.guild.id, null, null);
      return sendSuccess(ctx, 'Birthday message reset to the default.');
    }

    return sendError(
      ctx,
      `**Usage:**\n\`${prefix}birthday message set <text> [data: <name>]\`\n\`${prefix}birthday message remove\``,
    );
  }

  // ── $birthday (no args) — show settings ──────────────────────────────────
  if (!action) {
    if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

    const container = await buildBirthdaySettingsContainer(message.guild, client, prefix, message.author.id);
    return message.channel.send({
      components:      [container],
      flags:           MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  }

  return sendError(
    ctx,
    `**Usage:**\n\`${prefix}birthday set <date>\`\n\`${prefix}birthday unset\`\n\`${prefix}birthday list\`\n\`${prefix}birthday channel set|remove\`\n\`${prefix}birthday message set|remove\``,
  );
}
