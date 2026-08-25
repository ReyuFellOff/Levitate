import type { CassieClient } from '../../structures/CassieClient.js';
import { runPrefixRestriction, runSlashRestriction } from '../../helpers/restrictionCommand.js';

export const options = {
  name: 'reactionmute',
  aliases: ['rmute', 'reactmute'] as string[],
  description: 'Prevent a member from adding reactions anywhere in the server.',
  usage: 'reactionmute <@user|ID|username> [reason]',
  category: 'moderation',
  owner: false,
  cooldown: 5,
};

export function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  return runPrefixRestriction({ message, args, client, kind: 'reaction', enabled: true });
}

export function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  return runSlashRestriction({ interaction, client, kind: 'reaction', enabled: true });
}