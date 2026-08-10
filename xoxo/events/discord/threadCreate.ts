import type { LevitateClient } from '../../structures/LevitateClient.js';
import { syncReactionRestrictionForChannel } from '../../helpers/memberRestrictions.js';

export const name = 'threadCreate';
export const once = false;

export async function execute(thread: any, client: LevitateClient): Promise<void> {
  await syncReactionRestrictionForChannel(thread, client);
}