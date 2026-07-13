// xoxo/slashCommands/utility/ghostping.ts
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ghostping')
  .setDescription('Ghost-ping up to 10 users — pings them and immediately deletes the message.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((o) =>
    o.setName('user').setDescription('User to ghost-ping.').setRequired(true),
  )
  .addUserOption((o) =>
    o.setName('user2').setDescription('Second user to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user3').setDescription('Third user to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user4').setDescription('Fourth user to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user5').setDescription('Fifth user to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user6').setDescription('Sixth user to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user7').setDescription('Seventh user to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user8').setDescription('Eighth user to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user9').setDescription('Ninth user to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user10').setDescription('Tenth user to ghost-ping.').setRequired(false),
  );
