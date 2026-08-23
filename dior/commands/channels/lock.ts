import { config } from '../../config.js';
// xoxo/commands/moderation/lock.ts
//
// Lock one or more channels so @everyone cannot send messages or add reactions.
//
// Prefix:  $lock [#ch1] [#ch2] ... [reason]
// Slash:   /lock channel:[ch] channel2:[ch] ... reason:[text]
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
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { emojis } from '../../emojis.js';

export const options = {
  name:        'lock',
  aliases:     ['lockchannel'] as string[],
  description: 'Lock one or more channels so members cannot send messages.',
  usage: `lock
lock [#channel | channelId] [#channel2 | channelId2] ... [reason]`,
  category: 'channels',
  owner:    false,
  cooldown: 3,
};

const CHANNEL_REF = /^(?:<#\d+>|\d{17,20})$/;

function resolveChannel(guild: any, arg: string): any | null {
  const m = arg.match(/^<#(\d+)>$/) ?? arg.match(/^(\d{17,20})$/);
  if (!m) return null;
  return guild.channels.cache.get(m[1]) ?? null;
}

type Result = { ok: boolean; line: string };

async function applyLock(channel: any, guild: any, reason: string): Promise<Result> {
  if (channel.isThread?.())
    return { ok: false, line: `<#${channel.id}> - threads cannot be locked this way.` };

  const botPerms = channel.permissionsFor?.(guild.members.me);
  if (!botPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return { ok: false, line: `<#${channel.id}> - I'm missing Manage Channels there.` };

  const ok = await channel.permissionOverwrites
    .edit(
      guild.roles.everyone,
      {
        SendMessages:          false,
        SendMessagesInThreads: false,
        AddReactions:          false,
        CreatePublicThreads:   false,
        CreatePrivateThreads:  false,
      },
      { reason: reason || 'Channel locked.' },
    )
    .then(() => true).catch(() => false);

  return ok
    ? { ok: true,  line: `<#${channel.id}> - locked.${reason ? ` *(${reason})*` : ''}` }
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
    return sendError(ctx, 'You need the **Manage Channels** permission to lock channels.');

  const seen           = new Set<string>();
  const targets: any[] = [];
  const reasonParts: string[] = [];
  const badRefs: string[]     = [];

  for (const arg of args) {
    if (CHANNEL_REF.test(arg)) {
      const ch = resolveChannel(guild, arg);
      if (ch && !seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
      else if (!ch)                { badRefs.push(arg); }
      // duplicate valid ref → silently skip
    } else {
      reasonParts.push(arg);
    }
  }

  if (badRefs.length > 0)
    return sendError(ctx, `Channel${badRefs.length > 1 ? 's' : ''} not found: ${badRefs.join(', ')}`);
  if (targets.length === 0) targets.push(message.channel);

  const reason  = reasonParts.join(' ').trim();
  const results = await Promise.all(targets.map(ch => applyLock(ch, guild, reason)));
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
    return sendError(ctx, 'You need the **Manage Channels** permission to lock channels.');

  const seen           = new Set<string>();
  const targets: any[] = [];
  for (const name of ['channel', 'channel2', 'channel3', 'channel4', 'channel5']) {
    const ch = interaction.options.getChannel(name);
    if (ch && !seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
  }
  if (targets.length === 0) targets.push(interaction.channel);
  const reason: string = interaction.options.getString('reason') ?? '';

  const results = await Promise.all(targets.map((ch: any) => applyLock(ch, guild, reason)));
  return sendResults(ctx, results);
}
