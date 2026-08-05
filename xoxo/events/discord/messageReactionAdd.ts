import type { LevitateClient } from '../../structures/LevitateClient.js';
import { syncStarboardReaction } from '../../helpers/starboard.js';

export const name = 'messageReactionAdd';
export const once = false;

export async function execute(reaction: any, user: any, client?: LevitateClient): Promise<void> {
  if (user?.bot) return;
  console.log(`[starboard] messageReactionAdd received partial=${Boolean(reaction?.partial)} message=${reaction?.message?.id ?? 'unknown'}`);
  const candidates = [client, reaction?.client, reaction?.message?.client];
  const runtimeClient = candidates.find((candidate: any) =>
    candidate?.db && typeof candidate.db.getStarboardSettings === 'function',
  ) as LevitateClient | undefined;
  if (!runtimeClient) {
    console.error(`[starboard] Reaction add had no database client reference (injectedDb=${Boolean((client as any)?.db)} reactionDb=${Boolean(reaction?.client?.db)} messageDb=${Boolean(reaction?.message?.client?.db)})`);
    return;
  }
  await syncStarboardReaction(reaction, user, runtimeClient).catch((error: unknown) => {
    console.error(`[starboard] Failed to sync reaction add: ${error instanceof Error ? error.message : String(error)}`);
  });
}