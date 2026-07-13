// xoxo/events/discord/voiceStateUpdate.ts
//
// Logging: fires on voice channel join/leave/move and mute/deafen changes.
// Exceptions for the `vc` category are voice-channel IDs. For a move, the
// event is only suppressed if BOTH the origin and destination channels are
// in the exceptions list (per spec: a move involving a non-excepted channel
// is still visible).

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
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
