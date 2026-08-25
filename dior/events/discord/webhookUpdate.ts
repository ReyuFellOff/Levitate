// xoxo/events/discord/webhookUpdate.ts
//
// Discord only exposes a single generic `webhookUpdate` gateway event for a
// channel whenever ANY webhook on it changes (created, edited, or deleted) —
// there is no dedicated create/delete event. To detect new webhook creation
// for antinuke, we diff the channel's current webhook IDs against an
// in-memory "seen" set and attribute newcomers via the audit log.

import { AuditLogEvent } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { checkAntinukeModule } from '../../helpers/antinukeEngine.js';

export const name = 'webhookUpdate';
export const once = false;

/** channelId -> Set of webhook IDs already accounted for. */
const seenWebhooks = new Map<string, Set<string>>();

export async function execute(channel: any, client: CassieClient): Promise<void> {
  if (!channel.guild) return;

  const webhooks = await channel.fetchWebhooks().catch((): null => null);
  if (!webhooks) return;

  const currentIds = new Set<string>(webhooks.map((w: any) => w.id));
  let known = seenWebhooks.get(channel.id);

  if (!known) {
    // First time we've seen this channel — baseline without triggering antinuke.
    seenWebhooks.set(channel.id, currentIds);
    return;
  }

  const newWebhooks = webhooks.filter((w: any) => !known!.has(w.id));
  seenWebhooks.set(channel.id, currentIds);

  for (const webhook of newWebhooks.values()) {
    const executor = await fetchAuditLogExecutor(channel.guild, AuditLogEvent.WebhookCreate, webhook.id);
    await checkAntinukeModule({
      client,
      guild: channel.guild,
      module: 'webhookCreate',
      executor,
      actionDescription: `created webhook "${webhook.name ?? webhook.id}" in #${channel.name ?? channel.id}`,
      revert: async () => { await webhook.delete('Antinuke: reverting unauthorized webhook create'); },
    });
  }
}
