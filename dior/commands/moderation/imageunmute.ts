import type { CassieClient } from '../../structures/CassieClient.js';
import { runPrefixRestriction, runSlashRestriction } from '../../helpers/restrictionCommand.js';

export const options = {
  name: 'imageunmute',
  aliases: ['iunmute'] as string[],
  description: 'Restore a member’s ability to send images.',
  usage: 'imageunmute <@user|ID|username> [reason]',
  category: 'moderation',
  owner: false,
  cooldown: 5,
};

export function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  return runPrefixRestriction({ message, args, client, kind: 'image', enabled: false });
}

export function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  return runSlashRestriction({ interaction, client, kind: 'image', enabled: false });
}