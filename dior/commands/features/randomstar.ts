import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildRandomStarPayload } from '../../helpers/starboard.js';

export const options = {
  name: 'randomstar',
  aliases: ['randomstars', 'randomstarboard'] as string[],
  description: 'Show a random historical starboard post.',
  usage: 'randomstar',
  category: 'features',
  owner: false,
  cooldown: 5,
};

export async function prefixExecute(message: any, _args: string[], client: CassieClient): Promise<any> {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');
  return message.channel.send(await buildRandomStarPayload(client, message.guild.id));
}