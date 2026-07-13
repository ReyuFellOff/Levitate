import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('massnick')
  .setDescription('Change the nickname of every member at once (prepend, append, or reset).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)

  .addSubcommand((sc) =>
    sc.setName('prepend')
      .setDescription('Add a word BEFORE every member\'s current displayed name. Example: Jay → HLW Jay')
      .addStringOption((o) =>
        o.setName('word')
          .setDescription('Single word to prepend (no spaces).')
          .setRequired(true),
      ),
  )

  .addSubcommand((sc) =>
    sc.setName('append')
      .setDescription('Add a word AFTER every member\'s current displayed name. Example: Jay → Jay HLW')
      .addStringOption((o) =>
        o.setName('word')
          .setDescription('Single word to append (no spaces).')
          .setRequired(true),
      ),
  )

  .addSubcommand((sc) =>
    sc.setName('reset')
      .setDescription('Remove all server nicknames — every member reverts to their display name.'),
  );
