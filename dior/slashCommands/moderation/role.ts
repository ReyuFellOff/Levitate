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
  )

  .addSubcommand((sc) =>
    sc.setName('all-remove')
      .setDescription('Remove a role from every member in the server.')
      .addRoleOption((o) =>
        o.setName('role').setDescription('Role to remove from all members.').setRequired(true),
      ),
  )

  .addSubcommand((sc) =>
    sc.setName('hoist')
      .setDescription('Show or hide a role separately in the member list.')
      .addRoleOption((o) => o.setName('role').setDescription('Role to update.').setRequired(true))
      .addBooleanOption((o) => o.setName('enabled').setDescription('Whether the role is hoisted. Omit to toggle.').setRequired(false)),
  )

  .addSubcommand((sc) =>
    sc.setName('rename')
      .setDescription('Rename a role.')
      .addRoleOption((o) => o.setName('role').setDescription('Role to rename.').setRequired(true))
      .addStringOption((o) => o.setName('name').setDescription('New role name.').setMaxLength(100).setRequired(true)),
  )

  .addSubcommand((sc) =>
    sc.setName('delete')
      .setDescription('Delete a role.')
      .addRoleOption((o) => o.setName('role').setDescription('Role to delete.').setRequired(true)),
  )

  .addSubcommand((sc) =>
    sc.setName('mentionable')
      .setDescription('Allow or prevent members from mentioning a role.')
      .addRoleOption((o) => o.setName('role').setDescription('Role to update.').setRequired(true))
      .addBooleanOption((o) => o.setName('enabled').setDescription('Whether the role is mentionable. Omit to toggle.').setRequired(false)),
  )

  .addSubcommand((sc) =>
    sc.setName('create')
      .setDescription('Create a role.')
      .addStringOption((o) => o.setName('name').setDescription('New role name.').setMaxLength(100).setRequired(true)),
  )

  .addSubcommand((sc) =>
    sc.setName('color')
      .setDescription('Set a role color.')
      .addRoleOption((o) => o.setName('role').setDescription('Role to update.').setRequired(true))
      .addStringOption((o) => o.setName('color').setDescription('Six-digit hex color, for example #5865F2.').setRequired(true)),
  );
