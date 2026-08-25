import type { CassieClient } from '../../structures/CassieClient.js';
import { runPrefixRestriction, runSlashRestriction } from '../../helpers/restrictionCommand.js';

export const options = {
  name: 'imagemute',
  aliases: ['imute'] as string[],
  description: 'Prevent a member from sending images, image links, and image stickers.',
  usage: 'imagemute <@user|ID|username> [reason]',
  category: 'moderation',
  owner: false,
  cooldown: 5,
};

export function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  return runPrefixRestriction({ message, args, client, kind: 'image', enabled: true });
}

export function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  return runSlashRestriction({ interaction, client, kind: 'image', enabled: true });
}