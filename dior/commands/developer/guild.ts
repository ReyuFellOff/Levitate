import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperOutput } from '../../components/developer/devToolkit.js';

export const options = {
  name: 'guild',
  aliases: ['server'],
  description: 'Inspect a guild known to this bot.',
  usage: 'guild [guild-id]',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  const guildId = args[0] ?? message.guild?.id;
  if (!guildId) return message.channel.send(buildDeveloperOutput('Guild', 'Usage: `$guild [guild-id]`', false));

  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch((): null => null);
  if (!guild) return message.channel.send(buildDeveloperOutput('Guild', `Guild not found: ${guildId}`, false));

  const channels = [...guild.channels.cache.values()];
  const output = [
    `Name: ${guild.name}`,
    `ID: ${guild.id}`,
    `Owner: ${guild.ownerId ?? 'unknown'}`,
    `Members: ${guild.memberCount ?? 'unknown'}`,
    `Channels: ${channels.length}`,
    `Roles: ${guild.roles.cache.size}`,
    `Text channels: ${channels.filter((channel: any) => channel.isTextBased?.()).length}`,
    `Voice channels: ${channels.filter((channel: any) => channel.isVoiceBased?.()).length}`,
  ].join('\n');
  return message.channel.send(buildDeveloperOutput('Guild', output));
}