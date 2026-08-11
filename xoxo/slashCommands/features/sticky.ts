import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('sticky')
  .setDescription('Manage sticky messages that re-post themselves at the bottom of the channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

  // ── /sticky set-data ────────────────────────────────────────────────────────
  .addSubcommand((s) =>
    s
      .setName('set-data')
      .setDescription("Set the sticky from this server's saved data (embed, CV2, or message).")
      .addStringOption((o) =>
        o
          .setName('name')
          .setDescription("Name of the saved data entry to use as the sticky.")
          .setRequired(true),
      ),
  )

  // ── /sticky set-text ────────────────────────────────────────────────────────
  .addSubcommand((s) =>
    s
      .setName('set-text')
      .setDescription('Set a plain-text sticky message.')
      .addStringOption((o) =>
        o
          .setName('text')
          .setDescription('The text content for the sticky (max 2000 chars).')
          .setMaxLength(2000)
          .setRequired(true),
      ),
  )

  // ── /sticky enable ──────────────────────────────────────────────────────────
  .addSubcommand((s) =>
    s.setName('enable').setDescription('Re-enable a disabled sticky and immediately re-post it.'),
  )

  // ── /sticky disable ─────────────────────────────────────────────────────────
  .addSubcommand((s) =>
    s.setName('disable').setDescription('Pause the sticky (config kept, live message removed).'),
  )

  // ── /sticky view ────────────────────────────────────────────────────────────
  .addSubcommand((s) =>
    s.setName('view').setDescription('Show the current sticky configuration for this channel.'),
  );
