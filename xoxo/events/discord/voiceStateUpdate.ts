// xoxo/events/discord/voiceStateUpdate.ts
//
// Handles voice state changes for ALL members:
//   - Bot disconnect: destroy player first, then schedule 24/7 rejoin (this
//     order is critical — playerDestroy fires while no rejoin is pending, so
//     its clearRejoin() call is a no-op, and the rejoin survives).
//   - All members: join/leave/move/mute/deafen logging.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import { scheduleRejoin } from '../../helpers/twentyFourSeven.js';
import {
  buildVoiceJoinPayload,
  buildVoiceLeavePayload,
  buildVoiceMovePayload,
  buildVoiceStateFlagPayload,
} from '../../components/logging/logMessages.js';

export const name = 'voiceStateUpdate';
export const once = false;

export async function execute(oldState: any, newState: any, client: LevitateClient): Promise<void> {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;
  const member = newState.member ?? oldState.member;
  if (!member) return;

  // ── 24/7 bot reconnect logic ─────────────────────────────────────────────
  // Only fires when the bot itself is disconnected from a VC.
  // We destroy the player FIRST so that playerDestroy fires (and its
  // clearRejoin() runs) BEFORE we schedule the rejoin. This avoids the race
  // where clearRejoin() would cancel the rejoin we're about to schedule.
  if (member.id === client.user?.id && oldState.channelId && !newState.channelId) {
    const player = client.kazagumo?.players?.get(guild.id);
    if (player) await player.destroy().catch((): null => null);

    const is247 = await (client as any).db?.get24Seven?.(guild.id).catch((): null => null);
    if (is247?.enabled) {
      scheduleRejoin(client, guild.id, is247.channelId, 2000);
    }
    // Fall through so leave is still logged below.
  }

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  // ── Join / Leave / Move ──────────────────────────────────────────────────
  if (!oldChannel && newChannel) {
    await dispatchLog(client, guild.id, 'vc', [newChannel.id], buildVoiceJoinPayload(member, newChannel));
  } else if (oldChannel && !newChannel) {
    await dispatchLog(client, guild.id, 'vc', [oldChannel.id], buildVoiceLeavePayload(member, oldChannel));
  } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
    await dispatchLog(client, guild.id, 'vc', [oldChannel.id, newChannel.id], buildVoiceMovePayload(member, oldChannel, newChannel));
  }

  // ── Mute / Deafen (server-applied) ───────────────────────────────────────
  const activeChannel = newChannel ?? oldChannel;
  if (!activeChannel) return;

  if (oldState.serverMute !== newState.serverMute) {
    await dispatchLog(client, guild.id, 'vc', [activeChannel.id], buildVoiceStateFlagPayload(member, activeChannel, 'Server Mute', newState.serverMute));
  }
  if (oldState.serverDeaf !== newState.serverDeaf) {
    await dispatchLog(client, guild.id, 'vc', [activeChannel.id], buildVoiceStateFlagPayload(member, activeChannel, 'Server Deafen', newState.serverDeaf));
  }
  if (oldState.selfMute !== newState.selfMute) {
    await dispatchLog(client, guild.id, 'vc', [activeChannel.id], buildVoiceStateFlagPayload(member, activeChannel, 'Self Mute', newState.selfMute));
  }
  if (oldState.selfDeaf !== newState.selfDeaf) {
    await dispatchLog(client, guild.id, 'vc', [activeChannel.id], buildVoiceStateFlagPayload(member, activeChannel, 'Self Deafen', newState.selfDeaf));
  }
  if (oldState.streaming !== newState.streaming) {
    await dispatchLog(client, guild.id, 'vc', [activeChannel.id], buildVoiceStateFlagPayload(member, activeChannel, 'Streaming', newState.streaming));
  }
}
