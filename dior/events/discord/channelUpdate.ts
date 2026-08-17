// xoxo/events/discord/channelUpdate.ts
//
// Logging: fires when a guild channel's properties change.

import { AuditLogEvent } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildChannelUpdatePayload } from '../../components/logging/logMessages.js';
import { syncVoiceMasterCategory } from '../../helpers/voiceMaster.js';

export const name = 'channelUpdate';
export const once = false;

function diffFields(oldChannel: any, newChannel: any): { field: string; before: string; after: string }[] {
  const changes: { field: string; before: string; after: string }[] = [];

  if (oldChannel.name !== newChannel.name) {
    changes.push({ field: 'Name', before: oldChannel.name ?? '*None*', after: newChannel.name ?? '*None*' });
  }
  if (oldChannel.topic !== newChannel.topic) {
    changes.push({ field: 'Topic', before: oldChannel.topic ?? '*None*', after: newChannel.topic ?? '*None*' });
  }
  if (oldChannel.nsfw !== newChannel.nsfw) {
    changes.push({ field: 'NSFW', before: oldChannel.nsfw ? 'Yes' : 'No', after: newChannel.nsfw ? 'Yes' : 'No' });
  }
  if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
    changes.push({
      field: 'Slowmode',
      before: `${oldChannel.rateLimitPerUser ?? 0}s`,
      after: `${newChannel.rateLimitPerUser ?? 0}s`,
    });
  }
  if (oldChannel.parentId !== newChannel.parentId) {
    changes.push({
      field: 'Category',
      before: oldChannel.parent?.name ?? '*None*',
      after: newChannel.parent?.name ?? '*None*',
    });
  }
  if (oldChannel.bitrate !== undefined && oldChannel.bitrate !== newChannel.bitrate) {
    changes.push({ field: 'Bitrate', before: `${oldChannel.bitrate ?? 0}`, after: `${newChannel.bitrate ?? 0}` });
  }
  if (oldChannel.userLimit !== undefined && oldChannel.userLimit !== newChannel.userLimit) {
    changes.push({ field: 'User limit', before: `${oldChannel.userLimit ?? 0}`, after: `${newChannel.userLimit ?? 0}` });
  }

  return changes;
}

export async function execute(oldChannel: any, newChannel: any, client: LevitateClient): Promise<void> {
  if (!newChannel.guild) return;

  await syncVoiceMasterCategory(client, newChannel).catch((error: unknown) => {
    console.error(
      `[VoiceMaster] Category sync failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });

  const changes = diffFields(oldChannel, newChannel);
  if (!changes.length) return;

  const executor = await fetchAuditLogExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
  const payload = buildChannelUpdatePayload(newChannel, changes, executor);
  await dispatchLog(client, newChannel.guild.id, 'channel', [newChannel.id], payload);
}
