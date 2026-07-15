// xoxo/components/automod/automodHandler.ts
//
// Handles all `am:*` (buttons / selects) and `am-modal:*` (modal submissions)
// interactions for the AutoMod panel.
//
// CustomId scheme:
//   am:<action>:<msgId>          — buttons and select menus
//   am-modal:<action>:<msgId>    — modal submissions

import { MessageFlags } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import type { AutomodModuleKey } from '../../config/automodModules.js';
import { invalidateAutomodCache } from '../../helpers/automodEngine.js';
import {
  automodSessions,
  resetAutomodTimeout,
  buildAutomodHomePayload,
  buildAutomodConfigPayload,
  buildAutomodThresholdsModal,
  buildAutomodBadWordsPayload,
  buildAutomodWhitelistPayload,
  buildAutomodResetConfirmPayload,
  buildAutomodAddWordsModal,
} from './automodPanel.js';

const NOT_YOURS = 'This panel is not for you.';
const EXPIRED   = 'This AutoMod panel has expired. Run `$automod` again.';

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function handleAutomodInteraction(interaction: any, client: LevitateClient): Promise<void> {
  const rawId = interaction.customId as string;

  // Modal submissions: am-modal:<action>:<msgId>
  if (rawId.startsWith('am-modal:')) {
    const parts  = rawId.split(':');
    const action = parts[1];
    const msgId  = parts[2];
    await handleModalSubmit(interaction, action, msgId, client);
    return;
  }

  // Buttons / selects: am:<action>:<msgId>
  const parts  = rawId.split(':');
  const action = parts[1];
  const msgId  = parts.slice(2).join(':'); // handles msgId with no extra colons

  const session = automodSessions.get(msgId);
  if (!session) {
    await interaction.reply({ content: EXPIRED, flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }
  if (interaction.user?.id !== session.userId) {
    await interaction.reply({ content: NOT_YOURS, flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }

  resetAutomodTimeout(msgId);

  try {
    await route(interaction, action, msgId, session, client);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[automodHandler] Error handling action "${action}": ${msg}`);
    const payload = { content: 'Something went wrong. Try again.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch((): null => null);
    } else {
      await interaction.reply(payload).catch((): null => null);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

async function route(
  interaction: any,
  action:      string,
  msgId:       string,
  session:     ReturnType<typeof automodSessions['get']> & {},
  client:      LevitateClient,
): Promise<void> {

  // ── Navigate home ──────────────────────────────────────────────────────────
  if (action === 'home') {
    session.page  = 'home';
    session.draft = {};
    const config = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodHomePayload(config, msgId));
    return;
  }

  // ── Toggle enable/disable ──────────────────────────────────────────────────
  if (action === 'toggle') {
    const current = await client.db.getAutomodConfig(session.guildId);
    await client.db.setAutomodEnabled(session.guildId, !current.enabled);
    invalidateAutomodCache(session.guildId);
    const updated = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodHomePayload(updated, msgId));
    return;
  }

  // ── Open configure panel ───────────────────────────────────────────────────
  if (action === 'configure') {
    session.page  = 'configure';
    session.draft = {};
    const config = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodConfigPayload(config, session.draft, msgId));
    return;
  }

  // ── Configure: modules multi-select changed ────────────────────────────────
  if (action === 'cfg-modules') {
    const selected = new Set<AutomodModuleKey>(interaction.values ?? []);
    session.draft.modules = selected;
    const config = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodConfigPayload(config, session.draft, msgId));
    return;
  }

  // ── Configure: punishment select changed ──────────────────────────────────
  if (action === 'cfg-punishment') {
    session.draft.punishment = interaction.values?.[0] as any;
    const config = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodConfigPayload(config, session.draft, msgId));
    return;
  }

  // ── Configure: log channel select changed ─────────────────────────────────
  if (action === 'cfg-logchannel') {
    const channelId = interaction.channels?.first()?.id ?? null;
    session.draft.logChannel = channelId;
    const config = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodConfigPayload(config, session.draft, msgId));
    return;
  }

  // ── Configure: save ───────────────────────────────────────────────────────
  if (action === 'cfg-save') {
    const current = await client.db.getAutomodConfig(session.guildId);
    const modulesMap: Record<string, boolean> = {};
    const enabledModules = session.draft.modules ?? new Set(
      Object.entries(current.modules).filter(([, v]) => v).map(([k]) => k),
    );
    for (const key of ['antiSpam', 'antiLink', 'antiInvite', 'antiBadWords', 'antiMassMention', 'antiCaps', 'antiPing']) {
      modulesMap[key] = enabledModules.has(key as AutomodModuleKey);
    }
    const punishment  = session.draft.punishment ?? current.punishment;
    const logChannel  = session.draft.logChannel !== undefined ? session.draft.logChannel : current.log_channel_id;

    await client.db.saveAutomodConfig(session.guildId, {
      modules: modulesMap as Record<AutomodModuleKey, boolean>,
      punishment,
      log_channel_id: logChannel,
    });
    invalidateAutomodCache(session.guildId);

    session.page  = 'home';
    session.draft = {};
    const updated = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodHomePayload(updated, msgId));
    return;
  }

  // ── Open thresholds modal ─────────────────────────────────────────────────
  if (action === 'thresholds') {
    const config = await client.db.getAutomodConfig(session.guildId);
    await interaction.showModal(buildAutomodThresholdsModal(config, msgId));
    return;
  }

  // ── Open bad words panel ──────────────────────────────────────────────────
  if (action === 'badwords') {
    session.page = 'badwords';
    const config = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodBadWordsPayload(config, msgId));
    return;
  }

  // ── Bad words: open add modal ─────────────────────────────────────────────
  if (action === 'bw-add') {
    await interaction.showModal(buildAutomodAddWordsModal(msgId));
    return;
  }

  // ── Bad words: show clear confirm ─────────────────────────────────────────
  if (action === 'bw-clear') {
    const config = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodBadWordsPayload(config, msgId, true));
    return;
  }

  // ── Bad words: confirm clear ──────────────────────────────────────────────
  if (action === 'bw-clear-confirm') {
    await client.db.clearAutomodBadWords(session.guildId);
    invalidateAutomodCache(session.guildId);
    const updated = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodBadWordsPayload(updated, msgId));
    return;
  }

  // ── Bad words: remove selected words ─────────────────────────────────────
  if (action === 'bw-remove') {
    const toRemove = interaction.values ?? [];
    await client.db.removeAutomodBadWords(session.guildId, toRemove);
    invalidateAutomodCache(session.guildId);
    const updated = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodBadWordsPayload(updated, msgId));
    return;
  }

  // ── Open whitelist panel ──────────────────────────────────────────────────
  if (action === 'whitelist') {
    session.page = 'whitelist';
    const config = await client.db.getAutomodConfig(session.guildId);
    const guild  = await client.guilds.fetch(session.guildId).catch((): null => null);
    await interaction.update(await buildAutomodWhitelistPayload(config, msgId, guild));
    return;
  }

  // ── Whitelist: add user ───────────────────────────────────────────────────
  if (action === 'wl-user') {
    const userId = interaction.users?.first()?.id;
    if (!userId) { await interaction.deferUpdate(); return; }
    await client.db.addAutomodWhitelistEntry(session.guildId, { id: userId, type: 'user', added_by: session.userId });
    invalidateAutomodCache(session.guildId);
    const updated = await client.db.getAutomodConfig(session.guildId);
    const guild   = await client.guilds.fetch(session.guildId).catch((): null => null);
    await interaction.update(await buildAutomodWhitelistPayload(updated, msgId, guild));
    return;
  }

  // ── Whitelist: add role ───────────────────────────────────────────────────
  if (action === 'wl-role') {
    const roleId = interaction.roles?.first()?.id;
    if (!roleId) { await interaction.deferUpdate(); return; }
    await client.db.addAutomodWhitelistEntry(session.guildId, { id: roleId, type: 'role', added_by: session.userId });
    invalidateAutomodCache(session.guildId);
    const updated = await client.db.getAutomodConfig(session.guildId);
    const guild   = await client.guilds.fetch(session.guildId).catch((): null => null);
    await interaction.update(await buildAutomodWhitelistPayload(updated, msgId, guild));
    return;
  }

  // ── Whitelist: add channel ────────────────────────────────────────────────
  if (action === 'wl-channel') {
    const channelId = interaction.channels?.first()?.id;
    if (!channelId) { await interaction.deferUpdate(); return; }
    await client.db.addAutomodWhitelistEntry(session.guildId, { id: channelId, type: 'channel', added_by: session.userId });
    invalidateAutomodCache(session.guildId);
    const updated = await client.db.getAutomodConfig(session.guildId);
    const guild   = await client.guilds.fetch(session.guildId).catch((): null => null);
    await interaction.update(await buildAutomodWhitelistPayload(updated, msgId, guild));
    return;
  }

  // ── Whitelist: remove entries ─────────────────────────────────────────────
  if (action === 'wl-remove') {
    // Values are formatted as "type:id"
    const entries = (interaction.values ?? []).map((v: string) => {
      const [type, id] = v.split(':');
      return { type: type as 'user' | 'role' | 'channel', id };
    });
    await client.db.removeAutomodWhitelistEntries(session.guildId, entries);
    invalidateAutomodCache(session.guildId);
    const updated = await client.db.getAutomodConfig(session.guildId);
    const guild   = await client.guilds.fetch(session.guildId).catch((): null => null);
    await interaction.update(await buildAutomodWhitelistPayload(updated, msgId, guild));
    return;
  }

  // ── Reset: show confirm ───────────────────────────────────────────────────
  if (action === 'reset') {
    await interaction.update(buildAutomodResetConfirmPayload(msgId));
    return;
  }

  // ── Reset: confirm ────────────────────────────────────────────────────────
  if (action === 'reset-confirm') {
    await client.db.resetAutomodConfig(session.guildId);
    invalidateAutomodCache(session.guildId);
    session.page  = 'home';
    session.draft = {};
    const updated = await client.db.getAutomodConfig(session.guildId);
    await interaction.update(buildAutomodHomePayload(updated, msgId));
    return;
  }

  // Unknown action — silently ignore
  await interaction.deferUpdate().catch((): null => null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal submission handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleModalSubmit(
  interaction: any,
  action:      string,
  msgId:       string,
  client:      LevitateClient,
): Promise<void> {
  const session = automodSessions.get(msgId);

  // ── Thresholds modal ──────────────────────────────────────────────────────
  if (action === 'thresholds') {
    const parseField = (id: string, min: number, max: number, fallback: number): number => {
      const raw = interaction.fields?.getTextInputValue(id)?.trim() ?? '';
      const val = parseInt(raw, 10);
      return isNaN(val) ? fallback : Math.max(min, Math.min(max, val));
    };

    const spamThreshold   = parseField('spam_threshold',   1,   50,  5);
    const spamInterval    = parseField('spam_interval',    1,  300,  5);
    const mentionLimit    = parseField('mention_limit',    1,   50,  5);
    const capsPercentage  = parseField('caps_percentage',  10, 100, 70);
    const timeoutDuration = parseField('timeout_duration', 5, 86400, 300);

    const guildId = session?.guildId ?? interaction.guild?.id;
    if (!guildId) { await interaction.reply({ content: 'Session expired.', flags: MessageFlags.Ephemeral }); return; }

    await client.db.setAutomodThresholds(guildId, {
      spam_threshold:   spamThreshold,
      spam_interval:    spamInterval,
      mention_limit:    mentionLimit,
      caps_percentage:  capsPercentage,
      timeout_duration: timeoutDuration,
    });
    invalidateAutomodCache(guildId);

    // Edit the original panel to show updated home
    try {
      const channel = await client.channels.fetch(session?.channelId ?? interaction.channel?.id).catch((): null => null);
      const msg     = await (channel as any)?.messages?.fetch(msgId).catch((): null => null);
      if (msg) {
        const updated = await client.db.getAutomodConfig(guildId);
        await msg.edit(buildAutomodHomePayload(updated, msgId)).catch((): null => null);
      }
    } catch { /* ignore */ }

    await interaction.reply({
      content: `Thresholds saved — spam: **${spamThreshold}** msgs / **${spamInterval}s**, mentions: **${mentionLimit}**, caps: **${capsPercentage}%**, timeout: **${timeoutDuration}s**`,
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  // ── Add bad words modal ───────────────────────────────────────────────────
  if (action === 'bw-add') {
    const raw   = interaction.fields?.getTextInputValue('words')?.trim() ?? '';
    const words = raw
      .split(/[,\n]+/)
      .map((w: string) => w.trim().toLowerCase())
      .filter((w: string) => w.length > 0 && w.length <= 100);

    if (!words.length) {
      await interaction.reply({ content: 'No valid words found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const guildId = session?.guildId ?? interaction.guild?.id;
    if (!guildId) { await interaction.reply({ content: 'Session expired.', flags: MessageFlags.Ephemeral }); return; }

    const updated = await client.db.addAutomodBadWords(guildId, words);
    invalidateAutomodCache(guildId);

    // Edit the panel to show updated bad words
    try {
      const channel = await client.channels.fetch(session?.channelId ?? interaction.channel?.id).catch((): null => null);
      const msg     = await (channel as any)?.messages?.fetch(msgId).catch((): null => null);
      if (msg) await msg.edit(buildAutomodBadWordsPayload(updated, msgId)).catch((): null => null);
    } catch { /* ignore */ }

    await interaction.reply({
      content: `Added **${words.length}** word${words.length !== 1 ? 's' : ''} to the bad words list.`,
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  // Unknown modal — ignore
  await interaction.deferUpdate?.().catch((): null => null);
}
