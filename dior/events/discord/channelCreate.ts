// xoxo/events/discord/channelCreate.ts
//
// Logging: fires when a guild channel is created.

import { AuditLogEvent } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildChannelCreatePayload } from '../../components/logging/logMessages.js';
import { checkAntinukeModule } from '../../helpers/antinukeEngine.js';
import { syncReactionRestrictionForChannel } from '../../helpers/memberRestrictions.js';
import { applyJailOverwrite, getConfiguredJailRole } from '../../helpers/jail.js';

export const name = 'channelCreate';
export const once = false;

export async function execute(channel: any, client: LevitateClient): Promise<void> {
  if (!channel.guild) return;

  await syncReactionRestrictionForChannel(channel, client);

  const jailSetup = await getConfiguredJailRole(channel.guild, client);
  if (jailSetup) {
    await applyJailOverwrite(
      channel,
      jailSetup.role,
      channel.id === jailSetup.config.allowed_channel_id,
      'Jail setup: synchronize newly created channel',
    ).catch((err: any) => {
      console.error(`[channelCreate] failed to apply jail permissions to ${channel.id}: ${err?.message ?? err}`);
    });
  }

  const executor = await fetchAuditLogExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  const payload = buildChannelCreatePayload(channel, executor);
  await dispatchLog(client, channel.guild.id, 'channel', [channel.id], payload);

  await checkAntinukeModule({
    client,
    guild: channel.guild,
    module: 'channelCreate',
    executor,
    actionDescription: `created #${channel.name ?? channel.id}`,
    revert: async () => { await channel.delete('Antinuke: reverting unauthorized channel create'); },
  });
}
