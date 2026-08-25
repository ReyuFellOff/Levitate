import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperOutput } from '../../components/developer/devToolkit.js';
import { executeSafeCommand, rawCommandInput } from '../../helpers/devToolkit.js';

export const options = {
  name: 'exec',
  aliases: ['shell'],
  description: 'Run one of the allowlisted read-only maintenance commands.',
  usage: 'exec <pwd|ls|git status|git log|git diff --stat|node --version|npm run build|npm run check:command-parity>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], _client: CassieClient) {
  const output = await executeSafeCommand(rawCommandInput(message, args));
  return message.channel.send(buildDeveloperOutput('Exec', output));
}