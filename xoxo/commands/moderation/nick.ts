// xoxo/commands/moderation/nick.ts
//
// Change or reset a member's server nickname.
//
// Prefix:  $nick <@user|ID|username> <new nickname>
//          $nick <@user|ID|username> reset
// Slash:   /nick set user:[user] nickname:[text]
//          /nick reset user:[user]
//
// Requires ManageNicknames for the invoker.
// Special case: when targeting the bot itself, uses the REST @me endpoint
// so the bot can always change its own nickname regardless of role hierarchy.

import { PermissionFlagsBits, REST, Routes } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { buildModLogNick } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'nick',
  aliases:     ['nickname', 'setnick', 'setnickname'] as string[],
  description: "Change or reset a member's server nickname.",
  usage: `nick <@user|ID|username> <new nickname>
nick <@user|ID|username> reset`,
  category: 'moderation',
  owner:    false,
  cooldown: 3,
};

const MAX_NICK = 32;

/** Change the bot's own nickname via the @me REST endpoint. */
async function setBotSelfNick(
  guildId: string,
  nick:    string | null,
  token:   string,
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.patch(Routes.guildMember(guildId, '@me'), { body: { nick } });
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'You need the **Manage Nicknames** permission to change nicknames.');
  }

  if (args.length < 2) {
    return sendError(ctx, `Usage:\n\`\`\`\n${options.usage}\n\`\`\``);
  }

  const targetUser = await resolveUser(client, guild, args[0]);
  if (!targetUser) return sendError(ctx, 'User not found. Try a mention, user ID, or username.');

  const member = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!member) return sendError(ctx, 'That user is not a member of this server.');

  const isReset = args[1]?.toLowerCase() === 'reset';
  const newNick = isReset ? null : args.slice(1).join(' ').trim();

  if (!isReset && newNick && newNick.length > MAX_NICK) {
    return sendError(ctx, `Nickname is too long (**${newNick.length}** chars). Maximum is **${MAX_NICK}** characters.`);
  }

  // ── Special case: bot changing its own nickname ──────────────────────────
  if (member.id === client.user?.id) {
    const token = client.config.botToken;
    if (!token) return sendError(ctx, 'Bot token is not configured.');
    const oldNick = member.nickname as string | null;
    try {
      await setBotSelfNick(guild.id, newNick, token);
    } catch (err: any) {
      return sendError(ctx, `Failed to change my nickname: ${err.message}`);
    }
    sendModLog(client, guild.id, buildModLogNick(targetUser, oldNick, newNick, message.author.username));
    if (isReset) return sendSuccess(ctx, 'Reset my server nickname.');
    return sendSuccess(ctx, `Changed my server nickname to **${newNick}**.`);
  }

  // ── Normal member flow ───────────────────────────────────────────────────
  const botMember = guild.members.me;
  if (botMember && !botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'I need the **Manage Nicknames** permission to change nicknames.');
  }
  if (member.id === guild.ownerId) {
    return sendError(ctx, "I can't change the server owner's nickname.");
  }
  if (!member.manageable) {
    return sendError(ctx, "I can't change that member's nickname — they have a higher or equal role to me.");
  }

  const oldNick = member.nickname as string | null;
  await member.setNickname(newNick, `Nickname change requested by ${message.author.username}`);
  sendModLog(client, guild.id, buildModLogNick(targetUser, oldNick, newNick, message.author.username));

  if (isReset) {
    return sendSuccess(ctx, `Reset **${targetUser.username}**'s nickname.`);
  }
  return sendSuccess(ctx, `Set **${targetUser.username}**'s nickname to **${newNick}**.`);
}

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx   = { interaction };
  const guild = interaction.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'You need the **Manage Nicknames** permission to change nicknames.');
  }

  const sub        = interaction.options.getSubcommand() as string;
  const targetUser = interaction.options.getUser('user', true);

  const member = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!member) return sendError(ctx, 'That user is not a member of this server.');

  // ── Special case: bot changing its own nickname ──────────────────────────
  if (member.id === client.user?.id) {
    const token = client.config.botToken;
    if (!token) return sendError(ctx, 'Bot token is not configured.');
    const oldNick = member.nickname as string | null;

    if (sub === 'reset') {
      try {
        await setBotSelfNick(guild.id, null, token);
      } catch (err: any) {
        return sendError(ctx, `Failed to reset my nickname: ${err.message}`);
      }
      sendModLog(client, guild.id, buildModLogNick(targetUser, oldNick, null, interaction.user.username));
      return sendSuccess(ctx, 'Reset my server nickname.');
    }

    const newNick: string = interaction.options.getString('nickname', true).trim();
    if (newNick.length > MAX_NICK) {
      return sendError(ctx, `Nickname is too long (**${newNick.length}** chars). Maximum is **${MAX_NICK}** characters.`);
    }
    try {
      await setBotSelfNick(guild.id, newNick, token);
    } catch (err: any) {
      return sendError(ctx, `Failed to change my nickname: ${err.message}`);
    }
    sendModLog(client, guild.id, buildModLogNick(targetUser, oldNick, newNick, interaction.user.username));
    return sendSuccess(ctx, `Changed my server nickname to **${newNick}**.`);
  }

  // ── Normal member flow ───────────────────────────────────────────────────
  const botMember = guild.members.me;
  if (botMember && !botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'I need the **Manage Nicknames** permission to change nicknames.');
  }
  if (member.id === guild.ownerId) {
    return sendError(ctx, "I can't change the server owner's nickname.");
  }
  if (!member.manageable) {
    return sendError(ctx, "I can't change that member's nickname — they have a higher or equal role to me.");
  }

  if (sub === 'reset') {
    const oldNickReset = member.nickname as string | null;
    await member.setNickname(null, `Nickname reset by ${interaction.user.username}`);
    sendModLog(client, guild.id, buildModLogNick(targetUser, oldNickReset, null, interaction.user.username));
    return sendSuccess(ctx, `Reset **${targetUser.username}**'s nickname.`);
  }

  const newNick: string = interaction.options.getString('nickname', true).trim();
  if (newNick.length > MAX_NICK) {
    return sendError(ctx, `Nickname is too long (**${newNick.length}** chars). Maximum is **${MAX_NICK}** characters.`);
  }

  const oldNickSet = member.nickname as string | null;
  await member.setNickname(newNick, `Nickname change by ${interaction.user.username}`);
  sendModLog(client, guild.id, buildModLogNick(targetUser, oldNickSet, newNick, interaction.user.username));
  return sendSuccess(ctx, `Set **${targetUser.username}**'s nickname to **${newNick}**.`);
}
