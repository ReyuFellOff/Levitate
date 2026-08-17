// xoxo/commands/moderation/lockdown.ts
//
// Lock or unlock every text channel in the server at once.
//
// Prefix:  $lockdown [reason]
//          $lockdown unlock [reason]
//          $lockdown remove [reason]
// Slash:   /lockdown reason:[text]
//
// Iterates all text/announcement channels, applying (or reverting) the same
// @everyone overwrite that $lock/$unlock use on a single channel. Channels
// that are already in the target state are skipped. Server-wide, so it
// always asks for confirmation first.

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
  buildActionCancelledPayload,
} from '../../components/purgeConfirm.js';

export const options = {
  name:        'lockdown',
  aliases:     [] as string[],
  description: 'Lock or unlock every text channel in the server.',
  usage: `lockdown [reason]
lockdown unlock [reason]
lockdown remove [reason]`,
  category: 'channels',
  owner:    false,
  cooldown: 5,
};

const LOCK_OVERWRITE = {
  SendMessages:          false,
  SendMessagesInThreads: false,
  AddReactions:          false,
  CreatePublicThreads:   false,
  CreatePrivateThreads:  false,
};

const UNLOCK_OVERWRITE: Record<string, boolean | null> = {
  SendMessages:          null,
  SendMessagesInThreads: null,
  AddReactions:          null,
  CreatePublicThreads:   null,
  CreatePrivateThreads:  null,
};

function getLockableChannels(guild: any): any[] {
  return [...guild.channels.cache.values()].filter(
    (ch: any) =>
      (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) &&
      typeof ch.permissionOverwrites?.edit === 'function',
  );
}

function isLocked(channel: any, everyoneRoleId: string): boolean {
  const overwrite = channel.permissionOverwrites.cache.get(everyoneRoleId);
  return overwrite?.deny?.has?.(PermissionFlagsBits.SendMessages) === true;
}

export async function runLockdown(
  ctx:     { message?: any; interaction?: any; channel?: any },
  guild:   any,
  reason:  string,
  lifting: boolean,
): Promise<any> {
  const channels = getLockableChannels(guild);
  const everyoneId = guild.roles.everyone.id;
  const targets = channels.filter((ch) => (lifting ? isLocked(ch, everyoneId) : !isLocked(ch, everyoneId)));

  if (targets.length === 0) {
    return sendSuccess(
      ctx,
      lifting ? 'No channels are currently locked.' : 'Every text channel is already locked.',
    );
  }

  let succeeded = 0;
  let failed = 0;

  for (const channel of targets) {
    const ok = await channel.permissionOverwrites
      .edit(everyoneId, lifting ? UNLOCK_OVERWRITE : LOCK_OVERWRITE, {
        reason: reason || (lifting ? 'Server-wide lockdown lifted.' : 'Server-wide lockdown.'),
      })
      .then(() => true)
      .catch((err: any) => {
        console.error(`[lockdown] failed to ${lifting ? 'unlock' : 'lock'} #${channel.name} (${channel.id}): ${err?.message ?? err}`);
        return false;
      });
    if (ok) succeeded++; else failed++;
  }

  const verb = lifting ? 'unlocked' : 'locked';
  const summary = `Successfully **${verb}** ${succeeded} channel${succeeded !== 1 ? 's' : ''}` +
    (failed > 0 ? `, failed on ${failed} channel${failed !== 1 ? 's' : ''} (missing permissions).` : '.') +
    (reason ? `\n-# Reason: ${reason}` : '');

  return sendSuccess(ctx, summary);
}

export async function prefixExecute(
  message: any,
  args:    string[],
  _client: LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.Administrator) && !invokerPerms?.has?.(PermissionFlagsBits.ManageGuild)) {
    return sendError(ctx, 'You need the **Manage Server** permission to use this command.');
  }

  const action = args[0]?.toLowerCase();
  const lifting = action === 'unlock' || action === 'remove';
  const reason = (lifting ? args.slice(1) : args).join(' ').trim();

  const title = lifting ? 'Confirm Lockdown Lift' : 'Confirm Lockdown';
  const desc = lifting
    ? 'Are you sure you want to **unlock every text channel** in this server?'
    : 'Are you sure you want to **lock every text channel** in this server?';

  const confirmId = `lockdown:confirm:${message.id}`;
  const cancelId  = `lockdown:cancel:${message.id}`;

  const confirmMsg = await message.channel
    .send(buildActionConfirmPayload(confirmId, cancelId, title, desc))
    .catch((): null => null);
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
      await confirmMsg.delete().catch((): null => null);
      await runLockdown(ctx, guild, reason, lifting);
    } else {
      await confirmMsg
        .edit(buildActionCancelledPayload(confirmId, cancelId, title, desc))
        .catch((): null => null);
    }
  });

  collector.on('end', (_: any, endReason: string) => {
    if (endReason !== 'time') return;
    confirmMsg
      .edit(buildActionTimedOutPayload(confirmId, cancelId, title, desc))
      .catch((): null => null);
  });
}

export async function runSlashLockdown(
  interaction: any,
  lifting:     boolean,
): Promise<any> {
  await interaction.deferReply();
  const guild = interaction.guild;
  if (!guild) return sendError({ interaction }, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (
    !invokerMember?.permissions?.has?.(PermissionFlagsBits.Administrator) &&
    !invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageGuild)
  ) {
    return sendError({ interaction }, 'You need the **Manage Server** permission to use this command.');
  }

  const reason: string = interaction.options.getString('reason') ?? '';
  const title = lifting ? 'Confirm Lockdown Lift' : 'Confirm Lockdown';
  const desc = lifting
    ? 'Are you sure you want to **unlock every text channel** in this server?'
    : 'Are you sure you want to **lock every text channel** in this server?';

  const confirmId = `lockdown:confirm:${interaction.id}`;
  const cancelId  = `lockdown:cancel:${interaction.id}`;

  await interaction.editReply(buildActionConfirmPayload(confirmId, cancelId, title, desc));
  const confirmMsg = await interaction.fetchReply().catch((): null => null);
  if (!confirmMsg) return;

  const channelCtx = { channel: interaction.channel };

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
      await interaction.deleteReply().catch((): null => null);
      await runLockdown(channelCtx, guild, reason, lifting);
    } else {
      await i.editReply(buildActionCancelledPayload(confirmId, cancelId, title, desc)).catch((): null => null);
      setTimeout(() => interaction.deleteReply().catch((): null => null), 3000);
    }
  });

  collector.on('end', (_: any, endReason: string) => {
    if (endReason !== 'time') return;
    confirmMsg.edit(buildActionTimedOutPayload(confirmId, cancelId, title, desc)).catch((): null => null);
  });
}

export async function slashExecute(
  interaction: any,
  _client:     LevitateClient,
): Promise<any> {
  return runSlashLockdown(interaction, false);
}
