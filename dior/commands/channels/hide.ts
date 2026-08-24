import { config } from '../../config.js';
// xoxo/commands/moderation/hide.ts
//
// Hide one or more channels by denying ViewChannel for @everyone.
//
// Prefix:  $hide [#ch1 | id1] [#ch2 | id2] ...
// Slash:   /hide channel:[ch] channel2:[ch] ... channel5:[ch]
//
// If no channels are given, hides the current channel.
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
import { resolveTextChannel } from '../../helpers/textChannelResolver.js';
import { resolveVoiceChannel } from '../../helpers/voiceChannelResolver.js';

export const options = {
  name:        'hide',
  aliases:     ['hidechannel'] as string[],
  description: 'Hide one or more channels from @everyone.',
  usage: `hide
hide [#channel | channelId] [#channel2 | channelId2] ...`,
  category: 'channels',
  owner:    false,
  cooldown: 3,
};

function resolveChannel(guild: any, arg: string): any | null {
  return resolveTextChannel(guild, arg) ?? resolveVoiceChannel(guild, arg);
}

type Result = { ok: boolean; line: string };

async function applyHide(channel: any, guild: any): Promise<Result> {
  if (channel.isThread?.())
    return { ok: false, line: `<#${channel.id}> - threads can't be hidden.` };

  const botPerms = channel.permissionsFor?.(guild.members.me);
  if (!botPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return { ok: false, line: `<#${channel.id}> - I'm missing Manage Channels there.` };

  const everyoneOverwrite = channel.permissionOverwrites?.cache?.get(guild.roles.everyone.id);
  if (everyoneOverwrite?.deny?.has?.(PermissionFlagsBits.ViewChannel))
    return { ok: false, line: `<#${channel.id}> - already hidden.` };

  const ok = await channel.permissionOverwrites
    .edit(guild.roles.everyone, { ViewChannel: false }, { reason: 'Channel hidden.' })
    .then(() => true).catch(() => false);

  return ok
    ? { ok: true,  line: `<#${channel.id}> - hidden from @everyone.` }
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
    return sendError(ctx, 'You need the **Manage Channels** permission to hide channels.');

  // Collect unique channel targets from args; fall back to current channel.
  const seen    = new Set<string>();
  const targets: any[] = [];
  for (const arg of args) {
    const ch = resolveChannel(guild, arg);
    if (ch && !seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
  }
  if (targets.length === 0) targets.push(message.channel);

  const results = await Promise.all(targets.map(ch => applyHide(ch, guild)));
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
    return sendError(ctx, 'You need the **Manage Channels** permission to hide channels.');

  const seen    = new Set<string>();
  const targets: any[] = [];
  for (const name of ['channel', 'channel2', 'channel3', 'channel4', 'channel5']) {
    const ch = interaction.options.getChannel(name);
    if (ch && !seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
  }
  if (targets.length === 0) targets.push(interaction.channel);

  const results = await Promise.all(targets.map((ch: any) => applyHide(ch, guild)));
  return sendResults(ctx, results);
}
