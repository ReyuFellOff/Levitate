import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperOutput } from '../../components/developer/devToolkit.js';
import { reloadPrefixCommand } from '../../helpers/devToolkit.js';

export const options = {
  name: 'reload',
  aliases: ['reload-command'],
  description: 'Reload one prefix command from the compiled command source.',
  usage: 'reload <command>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  const output = await reloadPrefixCommand(client, args[0] ?? '');
  return message.channel.send(buildDeveloperOutput('Reload', output, !output.startsWith('Command not found') && !output.includes('no prefix handler')));
}