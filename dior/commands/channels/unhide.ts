import { config } from '../../config.js';
// xoxo/commands/moderation/unhide.ts
//
// Unhide one or more channels by removing the ViewChannel deny for @everyone.
//
// Prefix:  $unhide [#ch1 | id1] [#ch2 | id2] ...
// Slash:   /unhide channel:[ch] channel2:[ch] ... channel5:[ch]
//
// If no channels are given, unhides the current channel.
// Requires ManageChannels for both the invoker and the bot.
// Threads are excluded - they inherit their parent's visibility.

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
  name:        'unhide',
  aliases:     ['unhidechannel'] as string[],
  description: 'Unhide one or more previously hidden channels.',
  usage: `unhide
unhide [#channel | channelId] [#channel2 | channelId2] ...`,
  category: 'channels',
  owner:    false,
  cooldown: 3,
};

function resolveChannel(guild: any, arg: string): any | null {
  const m = arg.match(/^<#(\d+)>$/) ?? arg.match(/^(\d{17,20})$/);
  if (!m) return null;
  return guild.channels.cache.get(m[1]) ?? null;
}

type Result = { ok: boolean; line: string };

async function applyUnhide(channel: any, guild: any): Promise<Result> {
  if (channel.isThread?.())
    return { ok: false, line: `<#${channel.id}> - threads can't be unhidden.` };

  const botPerms = channel.permissionsFor?.(guild.members.me);
  if (!botPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return { ok: false, line: `<#${channel.id}> - I'm missing Manage Channels there.` };

  const everyoneOverwrite = channel.permissionOverwrites?.cache?.get(guild.roles.everyone.id);
  if (!everyoneOverwrite?.deny?.has?.(PermissionFlagsBits.ViewChannel))
    return { ok: false, line: `<#${channel.id}> - not hidden.` };

  // Set ViewChannel to null to remove the explicit deny while leaving other overrides intact.
  const ok = await channel.permissionOverwrites
    .edit(guild.roles.everyone, { ViewChannel: null }, { reason: 'Channel unhidden.' })
    .then(() => true).catch(() => false);

  return ok
    ? { ok: true,  line: `<#${channel.id}> - visible to @everyone again.` }
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
  _client: LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return sendError(ctx, 'You need the **Manage Channels** permission to unhide channels.');

  const seen    = new Set<string>();
  const targets: any[] = [];
  for (const arg of args) {
    const ch = resolveChannel(guild, arg);
    if (ch && !seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
  }
  if (targets.length === 0) targets.push(message.channel);

  const results = await Promise.all(targets.map(ch => applyUnhide(ch, guild)));
  return sendResults(ctx, results);
}

export async function slashExecute(
  interaction: any,
  _client:     LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx   = { interaction };
  const guild = interaction.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageChannels))
    return sendError(ctx, 'You need the **Manage Channels** permission to unhide channels.');

  const seen    = new Set<string>();
  const targets: any[] = [];
  for (const name of ['channel', 'channel2', 'channel3', 'channel4', 'channel5']) {
    const ch = interaction.options.getChannel(name);
    if (ch && !seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
  }
  if (targets.length === 0) targets.push(interaction.channel);

  const results = await Promise.all(targets.map((ch: any) => applyUnhide(ch, guild)));
  return sendResults(ctx, results);
}
