import type { CassieClient } from '../../structures/CassieClient.js';
import { syncStarboardReaction } from '../../helpers/starboard.js';
import { enforceReactionRestriction } from '../../helpers/memberRestrictions.js';
import { handleReactionRoleReaction } from '../../helpers/reactionRoles.js';
import { isVoiceMasterControlMessage } from '../../helpers/voiceMaster.js';

export const name = 'messageReactionAdd';
export const once = false;

export async function execute(reaction: any, user: any, client?: CassieClient): Promise<void> {
  const message = reaction?.message;
  const guildId = message?.guildId ?? message?.guild?.id;
  const channelId = message?.channelId ?? message?.channel?.id;
  const messageId = message?.id;
  const activeClient = (client as CassieClient | undefined)
    ?? (reaction?.client as CassieClient | undefined)
    ?? (message?.client as CassieClient | undefined);

  if (guildId && channelId && messageId && activeClient) {
    const isProtected = await isVoiceMasterControlMessage(activeClient, guildId, channelId, messageId);
    if (isProtected) {
      await reaction?.users?.remove?.(user?.id).catch((): null => null);
      return;
    }
  }

  const candidates = [client, reaction?.client, reaction?.message?.client];
  const runtimeClient = candidates.find((candidate: any) =>
    candidate?.db && typeof candidate.db.getStarboardSettings === 'function',
  ) as CassieClient | undefined;
  if (!runtimeClient) {
    console.error(`[starboard] Reaction add had no database client reference (injectedDb=${Boolean((client as any)?.db)} reactionDb=${Boolean(reaction?.client?.db)} messageDb=${Boolean(reaction?.message?.client?.db)})`);
    return;
  }
  if (!user?.bot && await enforceReactionRestriction(reaction, user, runtimeClient)) return;
  await handleReactionRoleReaction(reaction, user, runtimeClient, true);
  if (!user?.bot) {
    await syncStarboardReaction(reaction, user, runtimeClient).catch((error: unknown) => {
      console.error(`[starboard] Failed to sync reaction add: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}