import { ChannelType, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('jail')
  .setDescription('Configure the jail system or jail a member.')
  .addSubcommand((sc) =>
    sc.setName('setup')
      .setDescription('Create the Jailed role and configure channel permissions.')
      .addChannelOption((o) =>
        o.setName('allowed_channel')
          .setDescription('Optional channel where jailed members may view and send messages.')
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.GuildForum,
            ChannelType.GuildMedia,
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('remove')
      .setDescription('Remove jail channel permissions and delete the Jailed role.'),
  )
  .addSubcommand((sc) =>
    sc.setName('list')
      .setDescription('List members who currently have the Jailed role.'),
  )
  .addSubcommand((sc) =>
    sc.setName('status')
      .setDescription('Show the current jailed-member access rules.'),
  )
  .addSubcommand((sc) =>
    sc.setName('commands')
      .setDescription('Explain which commands jailed members can use.'),
  )
  .addSubcommand((sc) =>
    sc.setName('add')
      .setDescription('Jail a member.')
      .addUserOption((o) =>
        o.setName('user')
          .setDescription('The member to jail.')
          .setRequired(true),
      )
      .addStringOption((o) =>
        o.setName('reason')
          .setDescription('Reason for jailing the member.')
          .setMaxLength(512)
          .setRequired(false),
      ),
  );