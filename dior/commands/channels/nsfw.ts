import { config } from '../../config.js';
// xoxo/commands/moderation/nsfw.ts
//
// Toggle the NSFW flag on one or more channels.
//
// Prefix:  $nsfw [#ch1 | id1] [#ch2 | id2] ...
//
// If no channels are given, toggles the current channel.
// Requires ManageChannels for both the invoker and the bot.
// Only text-based, non-thread channels support NSFW.

import {
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { emojis } from '../../emojis.js';

export const options = {
  name:        'nsfw',
  aliases:     [] as string[],
  description: 'Toggle the NSFW flag on one or more channels.',
  usage:       'nsfw\nnsfw [#channel | channelId] [#channel2 | channelId2] ...',
  category:    'channels',
  owner:       false,
  cooldown:    5,
};

function resolveChannel(guild: any, arg: string): any | null {
  const m = arg.match(/^<#(\d+)>$/) ?? arg.match(/^(\d{17,20})$/);
  if (!m) return null;
  return guild.channels.cache.get(m[1]) ?? null;
}

type Result = { ok: boolean; line: string };

async function applyNsfw(channel: any, guild: any): Promise<Result> {
  if (!channel.isTextBased?.() || channel.isThread?.())
    return { ok: false, line: `<#${channel.id}> — NSFW can only be toggled on text channels.` };

  const botPerms = channel.permissionsFor?.(guild.members.me);
  if (!botPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return { ok: false, line: `<#${channel.id}> — I'm missing Manage Channels there.` };

  const newNsfw = !channel.nsfw;
  const ok = await channel.setNSFW(newNsfw, 'NSFW toggled.')
    .then(() => true).catch(() => false);

  return ok
    ? { ok: true,  line: `<#${channel.id}> — now **${newNsfw ? 'NSFW' : 'SFW'}**.` }
    : { ok: false, line: `<#${channel.id}> — failed (Discord error).` };
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
  _client: LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return sendError(ctx, 'You need the **Manage Channels** permission to toggle NSFW.');

  const seen    = new Set<string>();
  const targets: any[] = [];
  for (const arg of args) {
    const ch = resolveChannel(guild, arg);
    if (ch && !seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
  }
  if (targets.length === 0) targets.push(message.channel);

  const results = await Promise.all(targets.map(ch => applyNsfw(ch, guild)));
  return sendResults(ctx, results);
}
