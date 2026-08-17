import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('list')
  .setDescription('List roles, members, bots, emojis, stickers, channels, or bans in this server.')
  .addStringOption((o) =>
    o.setName('type')
      .setDescription('What to list.')
      .setRequired(true)
      .addChoices(
        { name: 'Roles',    value: 'roles' },
        { name: 'Members',  value: 'members' },
        { name: 'Bots',     value: 'bots' },
        { name: 'Emojis',   value: 'emojis' },
        { name: 'Stickers', value: 'stickers' },
        { name: 'Channels', value: 'channels' },
        { name: 'Bans',     value: 'bans' },
      ),
  );
