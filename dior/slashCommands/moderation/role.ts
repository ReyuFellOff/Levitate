import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('role')
  .setDescription('Add, remove, or mass-assign a role.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

  .addSubcommand((sc) =>
    sc.setName('add')
      .setDescription('Give a role to a specific member.')
      .addUserOption((o) =>
        o.setName('user').setDescription('Member to give the role to.').setRequired(true),
      )
      .addRoleOption((o) =>
        o.setName('role').setDescription('Role to assign. Omit to open a multi-select picker.').setRequired(false),
      ),
  )

  .addSubcommand((sc) =>
    sc.setName('remove')
      .setDescription('Take a role from a specific member.')
      .addUserOption((o) =>
        o.setName('user').setDescription('Member to remove the role from.').setRequired(true),
      )
      .addRoleOption((o) =>
        o.setName('role').setDescription('Role to remove. Omit to open a multi-select picker.').setRequired(false),
      ),
  )

  .addSubcommand((sc) =>
    sc.setName('all')
      .setDescription('Give a role to every member in the server (with confirmation).')
      .addRoleOption((o) =>
        o.setName('role').setDescription('Role to assign to all members.').setRequired(true),
      ),
  );
