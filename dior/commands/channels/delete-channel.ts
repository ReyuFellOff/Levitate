import { config } from '../../config.js';
// xoxo/commands/moderation/delete-channel.ts
//
// Delete a channel with a confirmation prompt.
//
// Prefix:  $delete-channel [#channel | channelId] ...
// Slash:   /delete-channel channel:[channel]
//
// If no channel is given, deletes the current channel.
// Requires ManageChannels for both the invoker and the bot.
// Shows one 30-second button confirmation before deleting all targets.
//
// Result-message strategy after the channel is deleted:
//   • Deleting the CURRENT channel - the whole channel disappears, so no
//     reply is sent (the confirmation message vanishes with it).
//   • Deleting a DIFFERENT channel - we use channel.send() on the invoking
//     channel directly, since the interaction reply / command message may
//     already be deleted by the time we reach that point.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
  buildActionCancelledPayload,
} from '../../components/purgeConfirm.js';
import { emojis } from '../../emojis.js';
import { MessageFlags, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { resolveTextChannel } from '../../helpers/textChannelResolver.js';
import { resolveVoiceChannel } from '../../helpers/voiceChannelResolver.js';

export const options = {
  name:        'delete-channel',
  aliases:     ['deletechannel', 'delchannel'] as string[],
  description: 'Delete a channel after confirmation.',
  usage: `delete-channel
  delete-channel [#channel | channelId] [#channel2 | channelId2] ...`,
  category: 'channels',
  owner:    false,
  cooldown: 5,
};

const TITLE = 'Delete Channel';
const NO_MENTIONS = { parse: [] as any[] };

function resolveChannel(guild: any, arg: string): any | null {
  return resolveTextChannel(guild, arg) ?? resolveVoiceChannel(guild, arg);
}

/** Send a plain status line directly to a channel object (no interaction/message context needed). */
async function sendToChannel(channel: any, emoji: string, text: string): Promise<void> {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${emoji} ${text}`),
  );
  await channel.send({
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: NO_MENTIONS,
  }).catch((): null => null);
}

// ─── Prefix confirmation flow ─────────────────────────────────────────────────

async function askConfirmation(
  message:        any,
  targets:        any[],
  invokeChannel:  any,   // the channel the command was run in
): Promise<void> {
  const confirmId     = `delch:confirm:${message.id}`;
  const cancelId      = `delch:cancel:${message.id}`;
  const description = targets.length === 1
    ? `Are you sure you want to **permanently delete** <#${targets[0].id}> (\`${targets[0].name}\`)?\n-# This action cannot be undone.`
    : `Are you sure you want to **permanently delete** these **${targets.length}** channels: ${targets.map((target) => `<#${target.id}>`).join(', ')}?\n-# This action cannot be undone.`;

  const confirmMsg = await invokeChannel.send(
    buildActionConfirmPayload(confirmId, cancelId, TITLE, description),
  ).catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, message.author.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);

    if (i.customId === confirmId) {
      // Clean up UI first.
      await confirmMsg.delete().catch((): null => null);
      await message.delete().catch((): null => null);

      const results: string[] = [];
      for (const target of targets) {
        const channelName = target.name as string;
        const ok = await target.delete('Channel deleted by moderator.').then(() => true).catch((err: any) => {
          console.error(`[delete-channel] failed to delete #${channelName} (${target.id}): ${err?.message ?? err}`);
          return false;
        });
        results.push(ok ? `${emojis.blacktick} \`${channelName}\` deleted.` : `${emojis.redcross} Failed to delete <#${target.id}>.`);
      }

      // The invoking channel may have been one of the deleted targets.
      if (!targets.some((target) => target.id === invokeChannel.id)) {
        await sendToChannel(invokeChannel, emojis.blacktick, results.join('\n'));
      }
      // If isSameChannel, the whole channel is gone - no reply possible or needed.
    } else {
      await confirmMsg
        .edit(buildActionCancelledPayload(confirmId, cancelId, TITLE, description))
        .catch((): null => null);
      setTimeout(async () => {
        await confirmMsg.delete().catch((): null => null);
        await message.delete().catch((): null => null);
      }, 3000);
    }
  });

  collector.on('end', (_collected: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildActionTimedOutPayload(confirmId, cancelId, TITLE, description))
      .catch((): null => null);
  });
}

// ─── Slash confirmation flow ──────────────────────────────────────────────────

async function askConfirmationSlash(
  interaction:   any,
  targets:        any[],
  invokeChannel: any,
): Promise<void> {
  const confirmId     = `delch:confirm:${interaction.id}`;
  const cancelId      = `delch:cancel:${interaction.id}`;
  const description = targets.length === 1
    ? `Are you sure you want to **permanently delete** <#${targets[0].id}> (\`${targets[0].name}\`)?\n-# This action cannot be undone.`
    : `Are you sure you want to **permanently delete** these **${targets.length}** channels: ${targets.map((target) => `<#${target.id}>`).join(', ')}?\n-# This action cannot be undone.`;

  await interaction.editReply(
    buildActionConfirmPayload(confirmId, cancelId, TITLE, description),
  );
  const confirmMsg = await interaction.fetchReply().catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, interaction.user.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);

    if (i.customId === confirmId) {
      // Remove the confirmation prompt before deleting the channel so Discord
      // doesn't show a "message could not be found" ghost.
      await interaction.deleteReply().catch((): null => null);

      const results: string[] = [];
      for (const target of targets) {
        const channelName = target.name as string;
        const ok = await target.delete('Channel deleted by moderator.').then(() => true).catch((err: any) => {
          console.error(`[delete-channel] failed to delete #${channelName} (${target.id}): ${err?.message ?? err}`);
          return false;
        });
        results.push(ok ? `${emojis.blacktick} \`${channelName}\` deleted.` : `${emojis.redcross} Failed to delete <#${target.id}>.`);
      }

      if (invokeChannel && !targets.some((target) => target.id === invokeChannel.id)) {
        await sendToChannel(invokeChannel, emojis.blacktick, results.join('\n'));
      }
    } else {
      await i
        .editReply(buildActionCancelledPayload(confirmId, cancelId, TITLE, description))
        .catch((): null => null);
      setTimeout(() => interaction.deleteReply().catch((): null => null), 3000);
    }
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildActionTimedOutPayload(confirmId, cancelId, TITLE, description))
      .catch((): null => null);
  });
}

// ─── Command entry points ─────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  _client: LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return sendError(ctx, 'You need the **Manage Channels** permission to delete channels.');

  const seen = new Set<string>();
  const targets: any[] = [];
  const badRefs: string[] = [];
  for (const arg of args) {
    const resolved = resolveChannel(guild, arg);
    if (!resolved) badRefs.push(arg);
    else if (!seen.has(resolved.id)) {
      seen.add(resolved.id);
      targets.push(resolved);
    }
  }

  if (badRefs.length > 0)
    return sendError(ctx, `Channel${badRefs.length > 1 ? 's' : ''} not found: ${badRefs.join(', ')}`);
  if (targets.length === 0) targets.push(message.channel);

  const botMember = guild.members.me;
  const missing = targets.find((target) => !target.permissionsFor?.(botMember)?.has?.(PermissionFlagsBits.ManageChannels));
  if (missing)
    return sendError(ctx, `I need the **Manage Channels** permission in <#${missing.id}> to delete it.`);

  return askConfirmation(message, targets, message.channel);
}

export async function slashExecute(
  interaction: any,
  _client:     LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx   = { interaction };
  const guild = interaction.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageChannels))
    return sendError(ctx, 'You need the **Manage Channels** permission to delete channels.');

  const seen = new Set<string>();
  const targets: any[] = [];
  for (const name of ['channel', 'channel2', 'channel3', 'channel4', 'channel5']) {
    const target = interaction.options.getChannel(name);
    if (target && !seen.has(target.id)) {
      seen.add(target.id);
      targets.push(target);
    }
  }
  if (targets.length === 0) targets.push(interaction.channel);

  const botMember = guild.members.me;
  const missing = targets.find((target) => !target.permissionsFor?.(botMember)?.has?.(PermissionFlagsBits.ManageChannels));
  if (missing)
    return sendError(ctx, `I need the **Manage Channels** permission in <#${missing.id}> to delete it.`);

  return askConfirmationSlash(interaction, targets, interaction.channel);
}
