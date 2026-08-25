import type { CassieClient } from '../../structures/CassieClient.js';
import { runPrefixRestriction, runSlashRestriction } from '../../helpers/restrictionCommand.js';

export const options = {
  name: 'reactionunmute',
  aliases: ['runmute', 'reactunmute'] as string[],
  description: 'Restore a member’s ability to add reactions.',
  usage: 'reactionunmute <@user|ID|username> [reason]',
  category: 'moderation',
  owner: false,
  cooldown: 5,
};

export function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  return runPrefixRestriction({ message, args, client, kind: 'reaction', enabled: false });
}

export function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  return runSlashRestriction({ interaction, client, kind: 'reaction', enabled: false });
}