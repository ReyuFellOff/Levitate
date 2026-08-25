import { config } from '../../config.js';
// xoxo/commands/moderation/unlock.ts
//
// Unlock one or more channels (removes the @everyone overwrite set by $lock).
//
// Prefix:  $unlock [#ch1] [#ch2] ... [reason]
// Slash:   /unlock channel:[ch] channel2:[ch] ... reason:[text]
//
// Channel refs (<#id> or bare snowflake) are parsed out first; everything
// else is joined as the reason. Unresolved refs are hard errors, not silent
// drops. Falls back to the current channel only when NO channel ref was given.
// Threads are rejected explicitly. Requires ManageChannels (invoker + bot).

import {
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { emojis } from '../../emojis.js';
import { resolveTextChannel } from '../../helpers/textChannelResolver.js';
import { resolveVoiceChannel } from '../../helpers/voiceChannelResolver.js';

export const options = {
  name:        'unlock',
  aliases:     ['unlockchannel'] as string[],
  description: 'Unlock one or more previously locked channels.',
  usage: `unlock
unlock [#channel | channelId] [#channel2 | channelId2] ... [reason]`,
  category: 'channels',
  owner:    false,
  cooldown: 3,
};

function resolveChannel(guild: any, arg: string): any | null {
  return resolveTextChannel(guild, arg) ?? resolveVoiceChannel(guild, arg);
}

type Result = { ok: boolean; line: string };

async function applyUnlock(channel: any, guild: any, reason: string): Promise<Result> {
  if (channel.isThread?.())
    return { ok: false, line: `<#${channel.id}> - threads cannot be unlocked this way.` };

  const botPerms = channel.permissionsFor?.(guild.members.me);
  if (!botPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return { ok: false, line: `<#${channel.id}> - I'm missing Manage Channels there.` };

  const ok = await channel.permissionOverwrites
    .edit(
      guild.roles.everyone,
      {
        SendMessages:          null,
        SendMessagesInThreads: null,
        AddReactions:          null,
        CreatePublicThreads:   null,
        CreatePrivateThreads:  null,
      },
      { reason: reason || 'Channel unlocked.' },
    )
    .then(() => true).catch(() => false);

  return ok
    ? { ok: true,  line: `<#${channel.id}> - unlocked.${reason ? ` *(${reason})*` : ''}` }
    : { ok: false, line: `<#${channel.id}> - failed (Discord error).` };
}

async function sendResults(
  ctx: { message?: any; interaction?: any },
  results: Result[],
): Promise<any> {
  const content = results
    .map(r => `${r.ok ? emojis.blacktick : emojis.redcross} ${r.line}`)
    .join('\n');
  const payload = {
    components: [
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(content),
      ),
    ],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  } as any;
  if (ctx.interaction) {
    return ctx.interaction.deferred || ctx.interaction.replied
      ? ctx.interaction.editReply(payload)
      : ctx.interaction.reply({ ...payload, fetchReply: true });
  }
  return ctx.message.reply({ ...payload, allowedMentions: { repliedUser: false } });
}

export async function prefixExecute(
  message: any,
  args:    string[],
  _client: CassieClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return sendError(ctx, 'You need the **Manage Channels** permission to unlock channels.');

  const seen           = new Set<string>();
  const targets: any[] = [];
  const reasonParts: string[] = [];
  const badRefs: string[]     = [];

  for (const arg of args) {
    const ch = resolveChannel(guild, arg);
    if (ch) {
      if (!seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
    } else if (/^(?:<#\d+>|\d{17,20})$/.test(arg)) {
      badRefs.push(arg);
    } else {
      reasonParts.push(arg);
    }
  }

  if (badRefs.length > 0)
    return sendError(ctx, `Channel${badRefs.length > 1 ? 's' : ''} not found: ${badRefs.join(', ')}`);
  if (targets.length === 0) targets.push(message.channel);

  const reason  = reasonParts.join(' ').trim();
  const results = await Promise.all(targets.map(ch => applyUnlock(ch, guild, reason)));
  return sendResults(ctx, results);
}

export async function slashExecute(
  interaction: any,
  _client:     CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx   = { interaction };
  const guild = interaction.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageChannels))
    return sendError(ctx, 'You need the **Manage Channels** permission to unlock channels.');

  const seen           = new Set<string>();
  const targets: any[] = [];
  for (const name of ['channel', 'channel2', 'channel3', 'channel4', 'channel5']) {
    const ch = interaction.options.getChannel(name);
    if (ch && !seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
  }
  if (targets.length === 0) targets.push(interaction.channel);
  const reason: string = interaction.options.getString('reason') ?? '';

  const results = await Promise.all(targets.map((ch: any) => applyUnlock(ch, guild, reason)));
  return sendResults(ctx, results);
}
