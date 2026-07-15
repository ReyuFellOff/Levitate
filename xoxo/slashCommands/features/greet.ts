import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('greet')
  .setDescription('Configure the server welcome message system.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

  // ── /greet channel ────────────────────────────────────────────────────────
  .addSubcommandGroup((g) =>
    g
      .setName('channel')
      .setDescription('Manage the greet channel.')
      .addSubcommand((s) =>
        s
          .setName('set')
          .setDescription('Set the channel where welcome messages are sent.')
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('The text channel to send welcome messages to.')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true),
          ),
      )
      .addSubcommand((s) =>
        s.setName('remove').setDescription('Remove the configured greet channel.'),
      )
      .addSubcommand((s) =>
        s.setName('view').setDescription('View the current greet settings.'),
      ),
  )

  // ── /greet message ────────────────────────────────────────────────────────
  .addSubcommandGroup((g) =>
    g
      .setName('message')
      .setDescription('Manage the greet message content.')
      .addSubcommand((s) =>
        s
          .setName('set')
          .setDescription('Set the welcome message text and optional saved-data attachment.')
          .addStringOption((o) =>
            o
              .setName('text')
              .setDescription(
                'Message text with ${placeholders}. Append [data: name] to attach a saved embed/CV2.',
              )
              .setMaxLength(1500)
              .setRequired(true),
          ),
      )
      .addSubcommand((s) =>
        s.setName('remove').setDescription('Remove the configured greet message.'),
      ),
  )

  // ── /greet test ───────────────────────────────────────────────────────────
  .addSubcommand((s) =>
    s
      .setName('test')
      .setDescription('Send a test welcome message to the greet channel using your own details.'),
  )

  // ── /greet bots ───────────────────────────────────────────────────────────
  .addSubcommand((s) =>
    s
      .setName('bots')
      .setDescription('Toggle whether bots are greeted when they join. Default: off.')
      .addBooleanOption((o) =>
        o
          .setName('enabled')
          .setDescription('True to greet bots, false to ignore them. Omit to toggle current state.')
          .setRequired(false),
      ),
  );
