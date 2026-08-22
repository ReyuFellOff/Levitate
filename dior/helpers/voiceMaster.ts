import { config } from '../config.js';
// xoxo/helpers/voiceMaster.ts
//
// Persistent join-to-create channel lifecycle. Configuration and temporary
// channel ownership live in MongoDB so the feature survives bot restarts.

import {
  AuditLogEvent,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../structures/LevitateClient.js';
import type {
  VoiceMasterChannelDoc,
  VoiceMasterSetupDoc,
} from '../database/database.js';
import { buildVoiceMasterPanelPayload } from '../components/voiceMaster.js';
import { descriptions } from '../config/descriptions.js';

const creatingUsers = new Set<string>();
const syncingCategory = new Set<string>();
const restoringPanels = new Set<string>();

const PANEL_DELETION_AUDIT_WINDOW_MS = 30_000;

async function clearVoiceMasterPanelReactions(message: any): Promise<void> {
  if ((message?.reactions?.cache?.size ?? 0) === 0) return;
  await message.reactions.removeAll('VoiceMaster panels do not accept reactions')
    .catch((): null => null);
}

export async function getVoiceMasterSetup(
  client: LevitateClient,
  guildId: string,
): Promise<VoiceMasterSetupDoc | null> {
  return (client as any).db?.getVoiceMasterSetup?.(guildId) ?? null;
}

export async function getVoiceMasterChannel(
  client: LevitateClient,
  channelId: string,
): Promise<VoiceMasterChannelDoc | null> {
  return (client as any).db?.getVoiceMasterChannel?.(channelId) ?? null;
}

export async function createVoiceMasterSetup(
  client: LevitateClient,
  guild: any,
  requestedControlChannel?: any,
): Promise<VoiceMasterSetupDoc> {
  const existing = await getVoiceMasterSetup(client, guild.id);
  if (existing) throw new Error('VoiceMaster is already set up in this server.');

  let createdControlChannel = false;
  let joinChannel: any = null;
  let controlChannel: any = requestedControlChannel ?? null;

  try {
    if (!controlChannel) {
      controlChannel = await guild.channels.create({
        name: 'interface',
        type: ChannelType.GuildText,
        position: 0,
        reason: 'VoiceMaster setup',
      });
      createdControlChannel = true;
    }

    const parentId = controlChannel.parentId ?? null;
    joinChannel = await guild.channels.create({
      name: 'Join To Create',
      type: ChannelType.GuildVoice,
      parent: parentId,
      reason: 'VoiceMaster setup',
    });

    const botMember = guild.members.me;
    const permissions = controlChannel.permissionsFor(botMember);
    if (!permissions?.has(PermissionFlagsBits.SendMessages) ||
        !permissions?.has(PermissionFlagsBits.EmbedLinks)) {
      throw new Error('I cannot send the VoiceMaster panel in the created text channel.');
    }

    const panel = await controlChannel.send(buildVoiceMasterPanelPayload(client, guild));
    const setup: VoiceMasterSetupDoc = {
      guild_id: guild.id,
      category_id: parentId ?? '',
      join_channel_id: joinChannel.id,
      control_channel_id: controlChannel.id,
      control_message_id: panel.id,
      updated_at: new Date(),
    };
    await (client as any).db?.setVoiceMasterSetup?.(setup);
    return setup;
  } catch (error) {
    if (createdControlChannel) {
      await controlChannel?.delete('VoiceMaster setup rollback').catch((): null => null);
    }
    await joinChannel?.delete('VoiceMaster setup rollback').catch((): null => null);
    throw error;
  }
}

/**
 * Brings a setup created by an older VoiceMaster version up to date.
 * Custom text channels are preserved; only the old generated `voice-master`
 * channel is renamed to the new default `interface` channel.
 */
export async function migrateVoiceMasterSetup(
  client: LevitateClient,
  guild: any,
): Promise<VoiceMasterSetupDoc> {
  const setup = await getVoiceMasterSetup(client, guild.id);
  if (!setup) throw new Error('VoiceMaster is not set up in this server.');

  const controlChannel = guild.channels.cache.get(setup.control_channel_id);
  const joinChannel = guild.channels.cache.get(setup.join_channel_id);

  if (controlChannel?.name === 'voice-master') {
    await controlChannel.setName('interface', 'Update VoiceMaster default channel name');
  }
  if (joinChannel?.name === 'Join to Create') {
    await joinChannel.setName('Join To Create', 'Update VoiceMaster join channel name');
  }

  setup.updated_at = new Date();
  await (client as any).db?.setVoiceMasterSetup?.(setup);
  await refreshVoiceMasterPanel(client, guild);
  return setup;
}

/** Refreshes all existing setups once the bot has connected and loaded MongoDB. */
export async function migrateVoiceMasterSetups(client: LevitateClient): Promise<void> {
  let migrated = 0;
  for (const guild of client.guilds.cache.values()) {
    if (!await getVoiceMasterSetup(client, guild.id)) continue;
    try {
      await migrateVoiceMasterSetup(client, guild);
      migrated++;
    } catch (error: unknown) {
      console.error(
        `[VoiceMaster] Startup migration failed for ${guild.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (migrated) console.log(`[VoiceMaster] Refreshed ${migrated} existing setup(s) on startup.`);
}

export async function resolveGuildPrefix(
  client: LevitateClient,
  guildId?: string | null,
): Promise<string> {
  const fallback = client.config?.prefix ?? '$';
  if (!guildId || !(client as any).db?.getGuildPrefix) return fallback;

  const guildPrefix = await (client as any).db.getGuildPrefix(guildId).catch((): null => null);
  return guildPrefix || fallback;
}

export async function isVoiceMasterControlMessage(
  client: LevitateClient,
  guildId: string | null | undefined,
  channelId: string,
  messageId: string,
): Promise<boolean> {
  if (!guildId) return false;
  const setup = await getVoiceMasterSetup(client, guildId);
  return !!setup && setup.control_channel_id === channelId && setup.control_message_id === messageId;
}

/**
 * Finds the moderator responsible for deleting the protected panel.
 *
 * Discord does not include the deleter in message delete gateway events, so
 * audit logs are the only reliable source for moderator deletions. Never use
 * the deleted message author as a fallback: the author is the bot, not the
 * member who removed the panel.
 */
export async function findVoiceMasterDeletionExecutor(
  guild: any,
  channelId: string,
  deletedMessageAuthorId?: string | null,
  bulk = false,
): Promise<any | null> {
  try {
    const logs = await guild.fetchAuditLogs({
      type: bulk ? AuditLogEvent.MessageBulkDelete : AuditLogEvent.MessageDelete,
      limit: 10,
    });
    const now = Date.now();
    const entry = [...logs.entries.values()].find((candidate: any) => {
      const createdAt = candidate.createdTimestamp ?? 0;
      if (now - createdAt > PANEL_DELETION_AUDIT_WINDOW_MS) return false;

      // MessageDelete stores the channel under extra.channel. Bulk deletes
      // identify the channel as the audit-log target.
      const loggedChannelId =
        candidate.extra?.channel?.id ??
        candidate.extra?.channel_id ??
        (bulk ? candidate.target?.id ?? candidate.targetId : null);
      if (loggedChannelId !== channelId) return false;

      if (!bulk && deletedMessageAuthorId) {
        const targetId = candidate.target?.id ?? candidate.targetId;
        if (targetId !== deletedMessageAuthorId) return false;
      }

      return true;
    });
    return entry?.executor ?? null;
  } catch {
    return null;
  }
}

export async function restoreVoiceMasterPanel(
  client: LevitateClient,
  guild: any,
  channel?: any,
  actingUser?: any,
): Promise<void> {
  const setup = await getVoiceMasterSetup(client, guild.id);
  if (!setup) return;

  const lockKey = `${guild.id}:${setup.control_channel_id}`;
  if (restoringPanels.has(lockKey)) return;
  restoringPanels.add(lockKey);

  try {
  const targetChannel = channel ?? guild.channels.cache.get(setup.control_channel_id)
    ?? await guild.channels.fetch(setup.control_channel_id).catch((): null => null);
    if (!targetChannel) return;

    const replacement = await targetChannel.send(buildVoiceMasterPanelPayload(client, guild)).catch((): null => null);
    if (!replacement) return;

    setup.control_message_id = replacement.id;
    await (client as any).db?.setVoiceMasterSetup?.(setup);

    // Startup repair has no deleter to report, so it only restores the panel.
    // Deletion events pass the audit-log executor and receive the short notice.
    if (!actingUser?.id) return;

    const prefix = await resolveGuildPrefix(client, guild.id);
    const userTag = `<@${actingUser.id}>`;
    const warningContent = `${userTag} ${descriptions.voicemaster.deleteBlocked(prefix)}`;
    const warningMessage = await targetChannel.send({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(warningContent),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: ['users'] },
    }).catch((): null => null);

    if (warningMessage) {
      setTimeout(() => {
        (warningMessage as any).delete?.().catch((): null => null);
      }, 10_000);
    }
  } finally {
    restoringPanels.delete(lockKey);
  }
}

export async function deleteVoiceMasterSetup(
  client: LevitateClient,
  guild: any,
): Promise<void> {
  const setup = await getVoiceMasterSetup(client, guild.id);
  if (!setup) throw new Error('VoiceMaster is not set up in this server.');

  const records: VoiceMasterChannelDoc[] =
    await (client as any).db?.getVoiceMasterChannels?.(guild.id) ?? [];
  for (const record of records) {
    const channel = guild.channels.cache.get(record.channel_id);
    await channel?.delete('VoiceMaster reset').catch((): null => null);
  }

  for (const channelId of [setup.control_channel_id, setup.join_channel_id]) {
    await guild.channels.cache.get(channelId)?.delete('VoiceMaster reset')
      .catch((): null => null);
  }

  await (client as any).db?.deleteVoiceMasterChannels?.(guild.id);
  await (client as any).db?.deleteVoiceMasterSetup?.(guild.id);

}

export async function syncVoiceMasterCategory(
  client: LevitateClient,
  updatedChannel: any,
): Promise<void> {
  if (!updatedChannel?.guild) return;
  const setup = await getVoiceMasterSetup(client, updatedChannel.guild.id);
  if (!setup) return;

  const isControl = updatedChannel.id === setup.control_channel_id;
  const isJoin = updatedChannel.id === setup.join_channel_id;
  if (!isControl && !isJoin) return;

  const peerId = isControl ? setup.join_channel_id : setup.control_channel_id;
  const peer = updatedChannel.guild.channels.cache.get(peerId);
  if (!peer || peer.parentId === updatedChannel.parentId) return;

  const lockKey = `${updatedChannel.guild.id}:${setup.control_channel_id}:${setup.join_channel_id}`;
  if (syncingCategory.has(lockKey)) return;
  syncingCategory.add(lockKey);
  try {
    await peer.setParent(updatedChannel.parentId ?? null, {
      lockPermissions: false,
      reason: 'Keep VoiceMaster channels in the same category',
    });
    setup.category_id = updatedChannel.parentId ?? '';
    await (client as any).db?.setVoiceMasterSetup?.(setup);
  } finally {
    syncingCategory.delete(lockKey);
  }
}

export async function refreshVoiceMasterPanel(
  client: LevitateClient,
  guild: any,
): Promise<void> {
  const setup = await getVoiceMasterSetup(client, guild.id);
  if (!setup) return;
  const channel = guild.channels.cache.get(setup.control_channel_id)
    ?? await guild.channels.fetch(setup.control_channel_id).catch((): null => null);
  if (!channel) return;
  const records = await (client as any).db?.getVoiceMasterChannels?.(guild.id) ?? [];
  const isLocked = records.some((record: VoiceMasterChannelDoc) => record.locked);
  const isHidden = records.some((record: VoiceMasterChannelDoc) => record.hidden);
  const message = await channel.messages.fetch(setup.control_message_id).catch((): null => null);
  if (message) {
    await clearVoiceMasterPanelReactions(message);
    await message.edit(
      buildVoiceMasterPanelPayload(client, guild, { locked: isLocked, hidden: isHidden }),
    ).catch((): null => null);
    return;
  }

  // A purge, manual deletion, or an old database record may leave the panel
  // message missing. Repair it without posting a deletion warning at startup
  // or during a normal state refresh.
  await restoreVoiceMasterPanel(client, guild, channel);
}

async function removeIfEmpty(
  client: LevitateClient,
  channel: any,
): Promise<void> {
  if (!channel || channel.members?.size > 0) return;
  const record = await getVoiceMasterChannel(client, channel.id);
  if (!record) return;
  await (client as any).db?.deleteVoiceMasterChannel?.(channel.id);
  await channel.delete('Empty VoiceMaster channel').catch((): null => null);
}

export async function handleVoiceMasterVoiceState(
  oldState: any,
  newState: any,
  client: LevitateClient,
): Promise<void> {
  const member = newState.member ?? oldState.member;
  const guild = newState.guild ?? oldState.guild;
  if (!member || !guild || member.user?.bot) return;

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    await removeIfEmpty(client, oldState.channel);
  }

  const setup = await getVoiceMasterSetup(client, guild.id);
  if (!setup || newState.channelId !== setup.join_channel_id) return;

  const lockKey = `${guild.id}:${member.id}`;
  if (creatingUsers.has(lockKey)) return;
  creatingUsers.add(lockKey);

  let channel: any = null;
  try {
    channel = await guild.channels.create({
      name: `${member.displayName}'s VC`.slice(0, 100),
      type: ChannelType.GuildVoice,
      parent: setup.category_id || null,
      reason: 'VoiceMaster temporary channel',
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.MoveMembers,
          ],
        },
      ],
    });

    const record: VoiceMasterChannelDoc = {
      guild_id: guild.id,
      channel_id: channel.id,
      owner_id: member.id,
      locked: false,
      hidden: false,
      logs: [`${new Date().toISOString()} — Temporary VC created.`],
      user_limit: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };
    await (client as any).db?.setVoiceMasterChannel?.(record);
    await member.voice.setChannel(channel);
  } catch (error: unknown) {
    console.error(
      `[VoiceMaster] Could not create a channel in ${guild.name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    if (channel) {
      await (client as any).db?.deleteVoiceMasterChannel?.(channel.id);
      await channel.delete('VoiceMaster creation failed').catch((): null => null);
    }
  } finally {
    creatingUsers.delete(lockKey);
  }
}