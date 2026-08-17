// xoxo/events/discord/guildUpdate.ts
//
// Logging: fires when server-level settings change (name, icon, banner,
// AFK/system channel, verification level, boost tier, description, vanity
// URL). Category: `server`, exception key: `guildUpdate`.

import { AuditLogEvent } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildGuildUpdatePayload } from '../../components/logging/logMessages.js';
import { checkAntinukeModule } from '../../helpers/antinukeEngine.js';

export const name = 'guildUpdate';
export const once = false;

function diffFields(oldGuild: any, newGuild: any): { field: string; before: string; after: string }[] {
  const changes: { field: string; before: string; after: string }[] = [];

  if (oldGuild.name !== newGuild.name) {
    changes.push({ field: 'Name', before: oldGuild.name, after: newGuild.name });
  }
  if (oldGuild.iconURL() !== newGuild.iconURL()) {
    changes.push({ field: 'Icon', before: oldGuild.iconURL() ?? '*None*', after: newGuild.iconURL() ?? '*None*' });
  }
  if (oldGuild.bannerURL() !== newGuild.bannerURL()) {
    changes.push({ field: 'Banner', before: oldGuild.bannerURL() ?? '*None*', after: newGuild.bannerURL() ?? '*None*' });
  }
  if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
    changes.push({
      field: 'AFK channel',
      before: oldGuild.afkChannelId ? `<#${oldGuild.afkChannelId}>` : '*None*',
      after: newGuild.afkChannelId ? `<#${newGuild.afkChannelId}>` : '*None*',
    });
  }
  if (oldGuild.systemChannelId !== newGuild.systemChannelId) {
    changes.push({
      field: 'System channel',
      before: oldGuild.systemChannelId ? `<#${oldGuild.systemChannelId}>` : '*None*',
      after: newGuild.systemChannelId ? `<#${newGuild.systemChannelId}>` : '*None*',
    });
  }
  if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
    changes.push({ field: 'Verification level', before: String(oldGuild.verificationLevel), after: String(newGuild.verificationLevel) });
  }
  if (oldGuild.premiumTier !== newGuild.premiumTier) {
    changes.push({ field: 'Boost tier', before: String(oldGuild.premiumTier), after: String(newGuild.premiumTier) });
  }
  if (oldGuild.description !== newGuild.description) {
    changes.push({ field: 'Description', before: oldGuild.description ?? '*None*', after: newGuild.description ?? '*None*' });
  }
  if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
    changes.push({ field: 'Vanity URL', before: oldGuild.vanityURLCode ?? '*None*', after: newGuild.vanityURLCode ?? '*None*' });
  }

  return changes;
}

export async function execute(oldGuild: any, newGuild: any, client: LevitateClient): Promise<void> {
  const changes = diffFields(oldGuild, newGuild);
  if (!changes.length) return;

  const payload = buildGuildUpdatePayload(newGuild, changes);
  await dispatchLog(client, newGuild.id, 'server', ['guildUpdate'], payload);

  const identityChanged = changes.some((c) => c.field === 'Name' || c.field === 'Icon' || c.field === 'Vanity URL');
  if (identityChanged) {
    const executor = await fetchAuditLogExecutor(newGuild, AuditLogEvent.GuildUpdate);
    const oldName = oldGuild.name;
    const oldIcon = oldGuild.iconURL();
    await checkAntinukeModule({
      client,
      guild: newGuild,
      module: 'guildUpdate',
      executor,
      actionDescription: 'changed the server name/icon/vanity URL',
      revert: async () => {
        await newGuild.setName(oldName, 'Antinuke: reverting unauthorized server identity change').catch((): null => null);
        if (oldIcon) await newGuild.setIcon(oldIcon, 'Antinuke: reverting unauthorized server identity change').catch((): null => null);
      },
    });
  }
}
