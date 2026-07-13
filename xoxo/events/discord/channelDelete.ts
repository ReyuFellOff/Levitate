// xoxo/events/discord/channelDelete.ts
//
// Logging: fires when a guild channel is deleted.

import { AuditLogEvent } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildChannelDeletePayload } from '../../components/logging/logMessages.js';
import { checkAntinukeModule } from '../../helpers/antinukeEngine.js';

export const name = 'channelDelete';
export const once = false;

export async function execute(channel: any, client: LevitateClient): Promise<void> {
  if (!channel.guild) return;

  const executor = await fetchAuditLogExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  const payload = buildChannelDeletePayload(channel, executor);
  await dispatchLog(client, channel.guild.id, 'channel', [channel.id], payload);

  const guild = channel.guild;
  const snapshot = {
    name: channel.name,
    type: channel.type,
    parent: channel.parentId,
    position: channel.rawPosition ?? channel.position,
    topic: channel.topic ?? undefined,
    nsfw: channel.nsfw ?? undefined,
    bitrate: channel.bitrate ?? undefined,
    userLimit: channel.userLimit ?? undefined,
    permissionOverwrites: channel.permissionOverwrites?.cache?.map((o: any) => ({ id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield })) ?? [],
  };

  await checkAntinukeModule({
    client,
    guild,
    module: 'channelDelete',
    executor,
    actionDescription: `deleted #${snapshot.name ?? channel.id}`,
    revert: async () => {
      await guild.channels.create({
        name: snapshot.name,
        type: snapshot.type,
        parent: snapshot.parent ?? undefined,
        topic: snapshot.topic,
        nsfw: snapshot.nsfw,
        bitrate: snapshot.bitrate,
        userLimit: snapshot.userLimit,
        permissionOverwrites: snapshot.permissionOverwrites,
        reason: 'Antinuke: reverting unauthorized channel delete',
      });
    },
  });
}
