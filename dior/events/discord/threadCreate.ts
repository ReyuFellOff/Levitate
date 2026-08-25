import type { CassieClient } from '../../structures/CassieClient.js';
import { syncReactionRestrictionForChannel } from '../../helpers/memberRestrictions.js';

export const name = 'threadCreate';
export const once = false;

export async function execute(thread: any, client: CassieClient): Promise<void> {
  await syncReactionRestrictionForChannel(thread, client);
}