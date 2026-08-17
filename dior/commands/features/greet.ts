// xoxo/commands/welcomer/greet.ts
//
// $greet                                   — show the current welcome message settings for this server.
// $greet channel set <#channel | id>       — set the greet channel
// $greet channel remove                    — remove it
// $greet channel view                      — view current settings
// $greet message set <text> [data: <name>] — set the welcome message text
// $greet message remove                    — clear it
// $greet bots [on|off]                     — toggle bot greets
// $greet test                              — send a test message
//
// Slash: /greet channel|message|test|bots — same layout as subcommands/groups.

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
import { parseSayText } from '../../helpers/emojiParser.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';

export const options = {
  name:        'greet',
  aliases:     ['welcomer', 'welcome'] as string[],
  description: 'Configure the server welcome message system — channel, message, bots, and test.',
  usage: `greet
greet channel set <#channel | channel-id>
greet channel remove
greet channel view
greet message set <text> [data: <saved-data-name>]
greet message remove
greet bots [on|off]
greet test`,
  category:    'features',
  owner:       false,
  cooldown:    3,
};

const MESSAGE_LIMIT = 1500;

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers (used by both prefix and slash)
// ─────────────────────────────────────────────────────────────────────────────

function resolveTextChannelById(guild: any, channelId: string): any | null {
  const ch = guild.channels.cache.get(channelId);
  if (!ch) return null;
  return (ch.type === ChannelType.GuildText ||
          ch.type === ChannelType.GuildAnnouncement ||
          (ch.isTextBased?.() && !ch.isVoiceBased?.())) ? ch : null;
}

function resolveTextChannelFromArg(guild: any, arg: string): any | null {
  const idMatch = arg.match(/^<#(\d+)>$/) ?? arg.match(/^(\d{17,20})$/);
  if (!idMatch) return null;
  return resolveTextChannelById(guild, idMatch[1]);
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
          `-# \`${prefix}greet channel set <#channel>\` — set greet channel`,
          `-# \`${prefix}greet channel remove\` — remove greet channel`,
          `-# \`${prefix}greet message set <text>\` — set welcome message`,
          `-# \`${prefix}greet message remove\` — clear welcome message`,
          `-# \`${prefix}greet bots [on|off]\` — toggle bot greets`,
          `-# \`${prefix}greet test\` — send a test message`,
          `-# \`${prefix}placeholders\` — all supported placeholder tokens`,
        ].join('\n'),
      ),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix — $greet [channel|message|bots|test] ...
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx    = { message };
  const prefix = client.config.prefix;
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!message.channel.permissionsFor?.(message.member)?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to use this command.');

  if (!client.db) return sendError(ctx, 'Database is unavailable.');

  const sub = args[0]?.toLowerCase();

  // ── No subcommand → show settings ─────────────────────────────────────────
  if (!sub) {
    const container = await buildSettingsContainer(message.guild, client, prefix);
    return message.channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  }

  // ── greet channel set|remove|view ─────────────────────────────────────────
  if (sub === 'channel') {
    const action = args[1]?.toLowerCase();

    if (action === 'set') {
      const raw = args[2];
      if (!raw) return sendError(ctx, `Provide a channel mention or ID.\n-# Example: \`${prefix}greet channel set #welcome\``);

      const ch = resolveTextChannelFromArg(message.guild, raw);
      if (!ch) return sendError(ctx, 'Could not find a text channel with that mention or ID in this server.');

      await client.db.setGreetChannel(message.guild.id, ch.id);
      return sendSuccess(ctx, `Greet channel set to <#${ch.id}>. Members who join will be welcomed there.`);
    }

    if (action === 'remove') {
      await client.db.setGreetChannel(message.guild.id, null);
      return sendSuccess(ctx, 'Greet channel removed. Welcome messages will no longer be sent.');
    }

    if (!action || action === 'view') {
      const container = await buildSettingsContainer(message.guild, client, prefix);
      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }

    return sendError(
      ctx,
      `**Usage:**\n\`${prefix}greet channel set <#channel>\`\n\`${prefix}greet channel remove\`\n\`${prefix}greet channel view\``,
    );
  }

  // ── greet message set|remove ──────────────────────────────────────────────
  if (sub === 'message') {
    const action = args[1]?.toLowerCase();

    if (action === 'set') {
      const raw = args.slice(2).join(' ');
      if (!raw.trim()) {
        return sendError(
          ctx,
          `Provide the message text after \`set\`.\n-# Example: \`${prefix}greet message set Welcome, \${user_mention}!\`\n-# Append \`[data: <name>]\` to also send a saved embed or CV2.`,
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

      await client.db.setGreetMessage(message.guild.id, parsedText ?? null, dataName ?? null);

      const parts: string[] = [];
      if (parsedText) parts.push(`text: \`${parsedText.slice(0, 60)}${parsedText.length > 60 ? '…' : ''}\``);
      if (dataName)   parts.push(`saved data: \`${dataName}\``);

      return sendSuccess(ctx, `Greet message set — ${parts.join(' + ')}.`);
    }

    if (action === 'remove') {
      await client.db.setGreetMessage(message.guild.id, null, null);
      return sendSuccess(ctx, 'Greet message cleared.');
    }

    return sendError(
      ctx,
      `**Usage:**\n\`${prefix}greet message set <text> [data: <name>]\`\n\`${prefix}greet message remove\``,
    );
  }

  // ── greet test ─────────────────────────────────────────────────────────────
  if (sub === 'test') {
    const result = await sendGreetMessage(message.member, client, true);

    if (!result.sent)
      return sendError(ctx, result.reason ?? 'Could not send the test greet message.');

    return sendSuccess(ctx, 'Test greet message sent to the configured channel.');
  }

  // ── greet bots [on|off] ────────────────────────────────────────────────────
  if (sub === 'bots') {
    const raw      = args[1]?.toLowerCase();
    const current  = await client.db.getGreetSettings(message.guild.id).catch((): null => null);
    const newValue = raw === 'on' ? true : raw === 'off' ? false : !(current?.greet_bots ?? false);

    await client.db.setGreetBots(message.guild.id, newValue);

    return sendSuccess(
      ctx,
      newValue
        ? 'Bot greet enabled — bots that join this server will now receive a welcome message.'
        : 'Bot greet disabled — bots that join this server will be silently ignored.',
    );
  }

  return sendError(
    ctx,
    `Unknown subcommand \`${sub}\`.\n**Usage:** \`${prefix}greet [channel|message|bots|test]\``,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash execute — handles /greet channel set|remove|view, /greet message set|remove,
//                /greet test, /greet bots
// ─────────────────────────────────────────────────────────────────────────────

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
