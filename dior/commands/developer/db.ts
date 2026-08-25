import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperOutput } from '../../components/developer/devToolkit.js';

export const options = {
  name: 'db',
  aliases: ['database'],
  description: 'Run safe, read-only project database diagnostics.',
  usage: 'db <status|media|restrictions|prefix> [guild-id]',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (!client.db) return message.channel.send(buildDeveloperOutput('Database', 'Database is not initialized.', false));

  const action = args[0]?.toLowerCase() ?? 'status';
  const guildId = args[1] ?? message.guild?.id;

  try {
    if (action === 'status') {
      await client.db.connect();
      return message.channel.send(buildDeveloperOutput('Database', 'Database connection is healthy.'));
    }
    if (!guildId) {
      return message.channel.send(buildDeveloperOutput('Database', 'This action needs a guild ID or a guild context.', false));
    }
    if (action === 'media') {
      const channels = await client.db.getMediaChannels(guildId);
      return message.channel.send(buildDeveloperOutput('Database: media', `Guild: ${guildId}\n${channels.join('\n') || '(none)'}`));
    }
    if (action === 'restrictions') {
      const restrictions = await client.db.getAllMemberRestrictions(guildId);
      return message.channel.send(buildDeveloperOutput('Database: restrictions', JSON.stringify(restrictions, null, 2) || '[]'));
    }
    if (action === 'prefix') {
      const prefix = await client.db.getGuildPrefix(guildId);
      return message.channel.send(buildDeveloperOutput('Database: prefix', `Guild: ${guildId}\nPrefix: ${prefix ?? '(default)'}`));
    }
    return message.channel.send(buildDeveloperOutput('Database', 'Allowed actions: `status`, `media`, `restrictions`, `prefix`.', false));
  } catch (error: any) {
    return message.channel.send(buildDeveloperOutput('Database failed', error?.stack ?? String(error), false));
  }
}