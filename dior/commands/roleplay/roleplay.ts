import type { CassieClient } from '../../structures/CassieClient.js';
import { roleplayActions, runRoleplay } from '../../helpers/roleplay.js';

export const commands = roleplayActions.map((action) => ({
  options: {
    name: action.name,
    aliases: [] as string[],
    description: `Use the ${action.name} roleplay GIF.`,
    usage: `${action.name} [user] [user2]`,
    category: 'roleplay',
    owner: false,
    cooldown: 3,
  },
  prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
    return runRoleplay(action, { message }, client, args);
  },
}));