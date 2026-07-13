// xoxo/commands/moderation/slowmode.ts
//
// Set the slowmode (rate limit) for one or more channels.
//
// Prefix:  $slowmode <duration> [#ch1] [#ch2] ...
//          (channel refs and duration tokens can be in any order)
// Slash:   /slowmode seconds:[n] channel:[ch] channel2:[ch] ...
//
// Channel refs (<#id> or bare snowflake) are extracted from args; everything
// else is joined as the duration string. Unresolved refs are hard errors.
// Falls back to the current channel only when NO channel ref was given.
// Requires ManageChannels for both the invoker and the bot.

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
  name:        'slowmode',
  aliases:     ['sm', 'ratelimit'] as string[],
  description: 'Set or clear the slowmode for one or more channels.',
  usage: `slowmode <duration> [#channel ...]\nslowmode 30s\nslowmode 5m #general #chat\nslowmode off`,
  category: 'moderation',
  owner:    false,
  cooldown: 3,
};

const MAX_SECONDS = 21_600;
const CHANNEL_REF = /^(?:<#\d+>|\d{17,20})$/;

function resolveChannel(guild: any, arg: string): any | null {
  const m = arg.match(/^<#(\d+)>$/) ?? arg.match(/^(\d{17,20})$/);
  if (!m) return null;
  return guild.channels.cache.get(m[1]) ?? null;
}

function fmt(s: number): string {
  if (s === 0) return 'disabled';
  const parts: string[] = [];
  const h   = Math.floor(s / 3_600);
  const m   = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  if (h   > 0) parts.push(`${h}h`);
  if (m   > 0) parts.push(`${m}m`);
  if (sec > 0) parts.push(`${sec}s`);
  return parts.join(' ');
}

function parseDurationToSeconds(raw: string): number | null {
  const input = raw.trim().toLowerCase();
  if (['off', 'disable', 'none', 'clear'].includes(input)) return 0;
  if (/^\d+$/.test(input)) return parseInt(input, 10);
  if (/^\d+(?::\d+){1,2}$/.test(input)) {
    const parts = input.split(':').map(Number);
    if (parts.length === 2) return (parts[0]! * 60) + parts[1]!;
    return (parts[0]! * 3_600) + (parts[1]! * 60) + parts[2]!;
  }
  const UNITS: Record<string, number> = {
    s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
    m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
    h: 3_600, hr: 3_600, hrs: 3_600, hour: 3_600, hours: 3_600,
    d: 86_400, day: 86_400, days: 86_400,
  };
  const compact = input.replace(/\s+/g, '');
  const matches = [...compact.matchAll(/(\d+)([a-z]+)/g)];
  if (matches.length && matches.reduce((sum, m) => sum + m[0].length, 0) === compact.length) {
    let seconds = 0;
    for (const match of matches) {
      const unit = UNITS[match[2]!];
      if (unit === undefined) return null;
      seconds += parseInt(match[1]!, 10) * unit;
    }
    return seconds;
  }
  return null;
}

type Result = { ok: boolean; line: string };

async function applySlowmode(channel: any, guild: any, seconds: number): Promise<Result> {
  const botPerms = channel.permissionsFor?.(guild.members.me);
  if (!botPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return { ok: false, line: `<#${channel.id}> — I'm missing Manage Channels there.` };

  if (typeof channel.setRateLimitPerUser !== 'function')
    return { ok: false, line: `<#${channel.id}> — slowmode not supported on this channel type.` };

  const ok = await channel.setRateLimitPerUser(seconds)
    .then(() => true).catch(() => false);

  if (!ok) return { ok: false, line: `<#${channel.id}> — failed (Discord error).` };

  return seconds === 0
    ? { ok: true, line: `<#${channel.id}> — slowmode **disabled**.` }
    : { ok: true, line: `<#${channel.id}> — slowmode set to **${fmt(seconds)}**.` };
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
      new ContainerBuilder().addTextDisplayComponents(
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
    return sendError(ctx, 'You need the **Manage Channels** permission to change the slowmode.');

  const seen           = new Set<string>();
  const targets: any[] = [];
  const durParts: string[] = [];
  const badRefs: string[]  = [];

  for (const arg of args) {
    if (CHANNEL_REF.test(arg)) {
      const ch = resolveChannel(guild, arg);
      if (ch && !seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
      else if (!ch)                { badRefs.push(arg); }
    } else {
      durParts.push(arg);
    }
  }

  if (badRefs.length > 0)
    return sendError(ctx, `Channel${badRefs.length > 1 ? 's' : ''} not found: ${badRefs.join(', ')}`);
  if (targets.length === 0) targets.push(message.channel);

  const raw = durParts.join(' ').trim();
  if (!raw)
    return sendError(ctx, 'Provide a duration (e.g. `30s`, `5m`, `2h 30m`, `off`). Max is 6 hours.');

  const seconds = parseDurationToSeconds(raw);
  if (seconds === null)
    return sendError(ctx, 'Invalid duration. Try `30s`, `5m`, `1h 30m`, `6h`, or `off`.');
  if (seconds < 0 || seconds > MAX_SECONDS)
    return sendError(ctx, 'Slowmode must be between **0** and **6 hours**. (`off` disables it.)');

  const results = await Promise.all(targets.map(ch => applySlowmode(ch, guild, seconds)));
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
    return sendError(ctx, 'You need the **Manage Channels** permission to change the slowmode.');

  const seconds: number = interaction.options.getInteger('seconds', true);

  const seen           = new Set<string>();
  const targets: any[] = [];
  for (const name of ['channel', 'channel2', 'channel3', 'channel4', 'channel5']) {
    const ch = interaction.options.getChannel(name);
    if (ch && !seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
  }
  if (targets.length === 0) targets.push(interaction.channel);

  const results = await Promise.all(targets.map((ch: any) => applySlowmode(ch, guild, seconds)));
  return sendResults(ctx, results);
}
