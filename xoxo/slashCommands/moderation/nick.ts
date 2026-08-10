import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('nick')
  .setDescription("Change or reset a member's server nickname.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)

  .addSubcommand((sc) =>
    sc.setName('set')
      .setDescription("Set a member's server nickname.")
      .addUserOption((o) =>
        o.setName('user').setDescription('Member whose nickname to change.').setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('nickname')
          .setDescription('New nickname (max 32 characters).')
          .setRequired(true)
          .setMaxLength(32),
      ),
  )

  .addSubcommand((sc) =>
    sc.setName('reset')
      .setDescription("Remove a member's server nickname (revert to their display name).")
      .addUserOption((o) =>
        o.setName('user').setDescription('Member whose nickname to reset.').setRequired(true),
      ),
  );
