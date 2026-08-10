import type { LevitateClient } from '../../structures/LevitateClient.js';
import { buildDeveloperOutput } from '../../components/developer/devToolkit.js';
import { rawCommandInput, readSource } from '../../helpers/devToolkit.js';

export const options = {
  name: 'source',
  aliases: ['src'],
  description: 'View a workspace source file without exposing environment files.',
  usage: 'source <workspace-relative-file>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], _client: LevitateClient) {
  return message.channel.send(buildDeveloperOutput('Source', readSource(rawCommandInput(message, args))));
}