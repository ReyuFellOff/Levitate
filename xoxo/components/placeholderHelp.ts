// xoxo/components/placeholderHelp.ts
//
// Paginated CV2 help panel listing all supported placeholder tokens.
// Sessions expire after 10 minutes of inactivity.
//
// customId routing in interactionCreate.ts:
//   Button → 'phhelp:prev' | 'phhelp:next' | 'phhelp:noop'

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';

// ─────────────────────────────────────────────────────────────────────────────
// Page definitions
// ─────────────────────────────────────────────────────────────────────────────

interface Page {
  title: string;
  lines: string[];
}

const PAGES: Page[] = [
  {
    title: 'User',
    lines: [
      '`${user_name}` — username (no discriminator)',
      '`${user_display_name}` — guild nickname → display name → username',
      '`${user_mention}` — @mention of the user',
      '`${user_id}` — user ID',
      '`${user_tag}` — same as `${user_name}` (modern Discord)',
      '`${user_avatar}` — avatar URL (PNG, 256 px)',
      '`${user_avatar_gif}` — animated avatar URL (GIF if animated, else PNG)',
      '`${user_banner}` — banner URL, empty string if none',
      '`${user_created_at}` — account creation date (YYYY-MM-DD)',
      '`${user_joined_at}` — server join date (YYYY-MM-DD)',
      '`${user_roles}` — comma-separated list of role names',
      '`${user_highest_role}` — name of the highest non-@everyone role',
      '`${user_is_bot}` — "Yes" or "No"',
    ],
  },
  {
    title: 'Server',
    lines: [
      '`${server_name}` — server name',
      '`${server_id}` — server ID',
      '`${server_icon}` — server icon URL (PNG, 256 px)',
      '`${server_member_count}` — total member count',
      '`${server_owner_id}` — owner\'s user ID',
      '`${server_owner_mention}` — @mention of the server owner',
      '`${server_created_at}` — server creation date (YYYY-MM-DD)',
      '`${server_boost_count}` — number of active boosts',
      '`${server_boost_tier}` — boost tier (0–3)',
    ],
  },
  {
    title: 'Channel & Time',
    lines: [
      '**Channel**',
      '`${channel_name}` — channel name',
      '`${channel_id}` — channel ID',
      '`${channel_mention}` — #channel mention',
      '',
      '**Time** *(UTC)*',
      '`${timestamp}` — Unix timestamp in seconds',
      '`${date}` — YYYY-MM-DD',
      '`${time}` — HH:MM:SS',
      '`${datetime}` — YYYY-MM-DD HH:MM:SS',
      '`${discord_ts}` — Discord long date + time: <t:unix:F>',
      '`${discord_ts_relative}` — Discord relative time: <t:unix:R>',
    ],
  },
  {
    title: 'Bot & Misc',
    lines: [
      '**Bot**',
      '`${bot_name}` — bot username',
      '`${bot_mention}` — @mention of the bot',
      '`${bot_id}` — bot client/application ID',
      '`${bot_avatar}` — bot avatar URL (PNG, 256 px)',
      '',
      '**Misc**',
      '`${newline}` — actual newline character',
      '`${zero_width}` — zero-width space (useful for empty embed fields)',
    ],
  },
];

export const TOTAL_PAGES = PAGES.length;

// ─────────────────────────────────────────────────────────────────────────────
// Session store
// ─────────────────────────────────────────────────────────────────────────────

interface PlaceholderHelpSession {
  userId: string;
  page: number;
  timeout: ReturnType<typeof setTimeout>;
}

export const phHelpSessions = new Map<string, PlaceholderHelpSession>();

const SESSION_TTL = 10 * 60_000;

function resetTimeout(messageId: string, interaction?: any): void {
  const session = phHelpSessions.get(messageId);
  if (!session) return;
  clearTimeout(session.timeout);
  session.timeout = setTimeout(async () => {
    phHelpSessions.delete(messageId);
    if (interaction) {
      const msg = interaction.message ?? await interaction.fetchReply?.().catch((): null => null);
      if (msg) {
        const timedOut = buildPayload(session.page, true);
        await msg.edit(timedOut).catch((): null => null);
      }
    }
  }, SESSION_TTL);
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildPayload(page: number, timedOut = false): any {
  const p = PAGES[page];
  const total = TOTAL_PAGES;

  const contentLines = [
    `# Placeholders — ${p.title}`,
    '',
    ...p.lines,
    '',
    '-# Use `${placeholder_name}` syntax in welcome messages, embeds, and CV2 data.',
    '-# When used in a welcome message, placeholders resolve to the user who just joined.',
  ];

  if (timedOut) {
    contentLines.push('-# This session has timed out. Run the command again to continue.');
  }

  const prevId = `phhelp:prev`;
  const nextId = `phhelp:next`;
  const noopId = `phhelp:noop`;

  return {
    components: [
      new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(contentLines.join('\n')),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(prevId)
              .setLabel('◀ Prev')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(timedOut || page === 0),
            new ButtonBuilder()
              .setCustomId(noopId)
              .setLabel(`Page ${page + 1} / ${total}`)
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(nextId)
              .setLabel('Next ▶')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(timedOut || page === total - 1),
          ),
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerPhHelpSession(messageId: string, userId: string): void {
  const existing = phHelpSessions.get(messageId);
  if (existing) clearTimeout(existing.timeout);

  const timeout = setTimeout(() => {
    phHelpSessions.delete(messageId);
  }, SESSION_TTL);

  phHelpSessions.set(messageId, { userId, page: 0, timeout });
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handlePhHelpNav(interaction: any, direction: number): Promise<void> {
  const messageId = interaction.message?.id;
  const session = messageId ? phHelpSessions.get(messageId) : undefined;

  if (!session) {
    await interaction.reply({ content: 'This session has expired. Run the command again.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  if (interaction.user.id !== session.userId) {
    await interaction.reply({ content: 'Only the person who ran this command can navigate it.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  const newPage = Math.max(0, Math.min(TOTAL_PAGES - 1, session.page + direction));
  session.page = newPage;

  await interaction.update(buildPayload(newPage, false)).catch((): null => null);
  resetTimeout(messageId, interaction);
}
