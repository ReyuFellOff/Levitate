// xoxo/slashCommands/utility/purge.ts
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Bulk-delete messages in the current channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((sc) =>
    sc.setName('all').setDescription('Delete every message in this channel (with confirmation).'),
  )
  .addSubcommand((sc) =>
    sc.setName('amount')
      .setDescription('Delete the most recent N messages.')
      .addIntegerOption((o) =>
        o.setName('count')
          .setDescription('How many recent messages to delete (1–1000).')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(1000),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('bot')
      .setDescription('Delete bot messages in this channel (with confirmation).')
      .addIntegerOption((o) =>
        o.setName('count')
          .setDescription('Maximum number of bot messages to delete. Omit for all.')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(1000),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('humans')
      .setDescription('Delete human (non-bot) messages in this channel (with confirmation).')
      .addIntegerOption((o) =>
        o.setName('count')
          .setDescription('Maximum number of human messages to delete. Omit for all.')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(1000),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('user')
      .setDescription('Delete messages from a specific user (with confirmation).')
      .addUserOption((o) =>
        o.setName('user').setDescription('Whose messages to delete.').setRequired(true),
      )
      .addIntegerOption((o) =>
        o.setName('count')
          .setDescription('Maximum number of messages to delete. Omit for all.')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(1000),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('text')
      .setDescription('Delete messages containing one or more search terms.')
      .addStringOption((o) =>
        o.setName('terms')
          .setDescription('Quoted terms (up to 10): "hello" "world", or a single bare phrase.')
          .setRequired(true),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('images')
      .setDescription('Delete messages that contain image attachments (with confirmation).')
      .addIntegerOption((o) =>
        o.setName('count')
          .setDescription('Maximum number of image messages to delete. Omit for all.')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(1000),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('files')
      .setDescription('Delete messages that have any file attachment (with confirmation).')
      .addIntegerOption((o) =>
        o.setName('count')
          .setDescription('Maximum number of messages with attachments to delete. Omit for all.')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(1000),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('links')
      .setDescription('Delete messages containing HTTP/HTTPS URLs (with confirmation).')
      .addIntegerOption((o) =>
        o.setName('count')
          .setDescription('Maximum number of URL messages to delete. Omit for all.')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(1000),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('link')
      .setDescription('Delete one or more messages by link (up to 10).')
      .addStringOption((o) =>
        o.setName('links')
          .setDescription('Quoted Discord message links: "link1" "link2", or a single bare link.')
          .setRequired(true),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('between')
      .setDescription('Delete all messages between two messages (inclusive, with confirmation).')
      .addStringOption((o) =>
        o.setName('link1').setDescription('First message ID or link.').setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('link2').setDescription('Second message ID or link.').setRequired(true),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('embeds')
      .setDescription('Delete messages that contain embeds (with confirmation).')
      .addIntegerOption((o) =>
        o.setName('count')
          .setDescription('Maximum number of embed messages to delete. Omit for all.')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(1000),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('reactions')
      .setDescription('Strip all reactions from recent messages (does not delete messages).')
      .addIntegerOption((o) =>
        o.setName('count')
          .setDescription('Maximum number of messages to strip reactions from. Omit for all.')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(1000),
      ),
  );
