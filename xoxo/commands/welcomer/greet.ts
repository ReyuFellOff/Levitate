// xoxo/commands/welcomer/greet.ts
//
// $greet — show the current welcome message settings for this server.
//
// To configure, use the dedicated commands:
//   $greet-channel set <#channel>  — set the greet channel
//   $greet-channel remove          — remove it
//   $greet-message set <text>      — set the welcome message text
//   $greet-message remove          — clear it
//   $greet-bots [on|off]           — toggle bot greets
//   $greet-test                    — send a test message

import {
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { sendGreetMessage } from '../../components/welcomer/greetSender.js';

export const options = {
  name:        'greet',
  aliases:     ['welcomer', 'welcome'] as string[],
  description: 'Show the current welcome message settings for this server.',
  usage:       'greet',
  category:    'welcomer',
  owner:       false,
  cooldown:    3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers (used by both prefix and slash)
// ─────────────────────────────────────────────────────────────────────────────

function resolveTextChannel(guild: any, channelId: string): any | null {
  const ch = guild.channels.cache.get(channelId);
  if (!ch) return null;
  return (ch.type === ChannelType.GuildText ||
          ch.type === ChannelType.GuildAnnouncement ||
          (ch.isTextBased?.() && !ch.isVoiceBased?.())) ? ch : null;
}

function parseMessageInput(raw: string): { text: string | null; dataName: string | null } {
  const match = raw.match(/^([\s\S]*?)\s*\[data:\s*([^\]]+)\]\s*$/i);
  if (match) return { text: match[1].trim() || null, dataName: match[2].trim() || null };
  return { text: raw.trim() || null, dataName: null };
}

async function buildSettingsContainer(guild: any, client: LevitateClient, prefix: string): Promise<ContainerBuilder> {
  const s = await client.db.getGreetSettings(guild.id).catch((): null => null);

  const channelLine = s?.channel_id ? `**Channel:** <#${s.channel_id}>` : `**Channel:** Not set`;
  let messageLine = '**Message:** Not set';
  if (s?.message_text || s?.message_data) {
    const parts: string[] = [];
    if (s.message_text) parts.push(`\`${s.message_text.slice(0, 80)}${s.message_text.length > 80 ? '…' : ''}\``);
    if (s.message_data) parts.push(`saved data: \`${s.message_data}\``);
    messageLine = `**Message:** ${parts.join(' + ')}`;
  }
  const botsLine = `**Greet bots:** ${s?.greet_bots ? 'Yes' : 'No'}`;
  const statusLine = s?.channel_id ? `Welcome messages are **active**.` : `Welcome messages are **inactive** — no channel set.`;

  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Greet Settings`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([channelLine, messageLine, botsLine].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          statusLine, '',
          `-# \`${prefix}greet-channel set <#channel>\` — set greet channel`,
          `-# \`${prefix}greet-channel remove\` — remove greet channel`,
          `-# \`${prefix}greet-message set <text>\` — set welcome message`,
          `-# \`${prefix}greet-message remove\` — clear welcome message`,
          `-# \`${prefix}greet-bots [on|off]\` — toggle bot greets`,
          `-# \`${prefix}greet-test\` — send a test message`,
          `-# \`${prefix}placeholders\` — all supported placeholder tokens`,
        ].join('\n'),
      ),
    );
}

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!message.channel.permissionsFor?.(message.member)?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to use this command.');

  if (!client.db) return sendError(ctx, 'Database is unavailable.');

  const container = await buildSettingsContainer(message.guild, client, client.config.prefix);
  return message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash execute — handles /greet channel set|remove|view, /greet message set|remove,
//                /greet test, /greet bots
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGE_LIMIT = 1500;

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };

  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to use this command.');

  if (!client.db) return sendError(ctx, 'Database is unavailable.');

  const group  = interaction.options.getSubcommandGroup(false) as string | null;
  const sub    = interaction.options.getSubcommand() as string;
  const guild  = interaction.guild;
  const prefix = client.config.prefix;

  // ── /greet channel set|remove|view ────────────────────────────────────────
  if (group === 'channel') {
    if (sub === 'set') {
      const ch: any = interaction.options.getChannel('channel', true);
      if (!ch?.isTextBased?.() || ch?.isVoiceBased?.())
        return sendError(ctx, 'Please select a text channel.');
      await client.db.setGreetChannel(guild.id, ch.id);
      return sendSuccess(ctx, `Greet channel set to <#${ch.id}>. Members who join will be welcomed there.`);
    }
    if (sub === 'remove') {
      await client.db.setGreetChannel(guild.id, null);
      return sendSuccess(ctx, 'Greet channel removed. Welcome messages will no longer be sent.');
    }
    if (sub === 'view') {
      const container = await buildSettingsContainer(guild, client, prefix);
      return interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }
  }

  // ── /greet message set|remove ─────────────────────────────────────────────
  if (group === 'message') {
    if (sub === 'set') {
      const raw: string = interaction.options.getString('text', true);
      if (!raw.trim()) return sendError(ctx, 'Provide some message text.');
      const { text, dataName } = parseMessageInput(raw);
      if (!text && !dataName) return sendError(ctx, 'Could not parse the message.');
      if (text && text.length > MESSAGE_LIMIT)
        return sendError(ctx, `Message too long (**${text.length}** chars). Max is **${MESSAGE_LIMIT}**.`);
      if (dataName) {
        const exists = await client.db.savedDataNameExists(guild.id, dataName).catch((): boolean => false);
        if (!exists)
          return sendError(ctx, `No saved data named \`${dataName}\` in this server.`);
      }
      await client.db.setGreetMessage(guild.id, text ?? null, dataName ?? null);
      const parts: string[] = [];
      if (text)     parts.push(`text: \`${text.slice(0, 60)}${text.length > 60 ? '…' : ''}\``);
      if (dataName) parts.push(`saved data: \`${dataName}\``);
      return sendSuccess(ctx, `Greet message set — ${parts.join(' + ')}.`);
    }
    if (sub === 'remove') {
      await client.db.setGreetMessage(guild.id, null, null);
      return sendSuccess(ctx, 'Greet message cleared.');
    }
  }

  // ── /greet test ───────────────────────────────────────────────────────────
  if (sub === 'test') {
    const result = await sendGreetMessage(interaction.member, client, true);
    if (!result.sent) return sendError(ctx, result.reason ?? 'Could not send the test greet message.');
    return sendSuccess(ctx, 'Test greet message sent to the configured channel.');
  }

  // ── /greet bots ───────────────────────────────────────────────────────────
  if (sub === 'bots') {
    const enabled: boolean | null = interaction.options.getBoolean('enabled');
    const current = await client.db.getGreetSettings(guild.id).catch((): null => null);
    const newValue = enabled !== null ? enabled : !(current?.greet_bots ?? false);
    await client.db.setGreetBots(guild.id, newValue);
    return sendSuccess(
      ctx,
      newValue
        ? 'Bot greet enabled — bots that join this server will now receive a welcome message.'
        : 'Bot greet disabled — bots that join this server will be silently ignored.',
    );
  }

  return sendError(ctx, 'Unknown sub-command.');
}
