import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Add or remove a timeout from a member.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((sc) =>
    sc.setName('add')
      .setDescription('Timeout a member for a specified duration.')
      .addUserOption((o) =>
        o.setName('user')
          .setDescription('The member to timeout.')
          .setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('duration')
          .setDescription('Duration e.g. 10m, 1h, 12h, 1d, 7d (max 28 days).')
          .setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('reason')
          .setDescription('Reason for the timeout.')
          .setRequired(false)
          .setMaxLength(512),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('remove')
      .setDescription('Remove an active timeout from a member.')
      .addUserOption((o) =>
        o.setName('user')
          .setDescription('The member whose timeout to remove.')
          .setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('reason')
          .setDescription('Reason for removing the timeout.')
          .setRequired(false)
          .setMaxLength(512),
      ),
  );
