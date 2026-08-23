import { config } from '../../config.js';
// xoxo/commands/moderation/nuke.ts
//
// Nuke one or more channels: delete each then immediately recreate it with
// identical settings (name, topic, slowmode, NSFW, position, category,
// permission overwrites).
//
// Prefix:  $nuke [#ch1 | id1] [#ch2 | id2] ...
//
// Unresolved channel refs are hard errors. Falls back to the current channel
// only when no channel ref was given. Channels are processed sequentially.
// Failures (missing perms, delete error, recreate error) are reported back
// to the invoking channel after all targets are processed.
// Requires ManageChannels (invoker + bot).

import {
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
  buildActionCancelledPayload,
} from '../../components/purgeConfirm.js';
import { emojis } from '../../emojis.js';

const TITLE = 'Confirm Nuke';

export const options = {
  name:        'nuke',
  aliases:     [] as string[],
  description: 'Delete and instantly recreate one or more channels with identical settings.',
  usage:       'nuke\nnuke [#channel | channelId] [#channel2 | channelId2] ...',
  category:    'channels',
  owner:       false,
  cooldown:    10,
};

const CHANNEL_REF = /^(?:<#\d+>|\d{17,20})$/;

function resolveChannel(guild: any, arg: string): any | null {
  const m = arg.match(/^<#(\d+)>$/) ?? arg.match(/^(\d{17,20})$/);
  if (!m) return null;
  return guild.channels.cache.get(m[1]) ?? null;
}

type NukeResult = { ok: boolean; line: string };

async function nukeOne(
  channel:         any,
  guild:           any,
  invokerUsername: string,
): Promise<NukeResult> {
  const botPerms = channel.permissionsFor?.(guild.members.me);
  if (!botPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return { ok: false, line: `#${channel.name} - I'm missing Manage Channels there.` };

  const snapshot = {
    name:     channel.name  as string,
    type:     channel.type,
    topic:    channel.topic     ?? undefined,
    nsfw:     channel.nsfw      ?? false,
    rateLimitPerUser: channel.rateLimitPerUser ?? 0,
    parent:   channel.parentId  ?? null,
    position: channel.position  ?? 0,
    permissionOverwrites: [
      ...(channel.permissionOverwrites?.cache?.values() ?? []),
    ].map((o: any) => ({
      id:    o.id,
      type:  o.type,
      allow: o.allow,
      deny:  o.deny,
    })),
  };

  const deleted = await channel
    .delete(`Channel nuked by ${invokerUsername}`)
    .then(() => true).catch(() => false);
  if (!deleted)
    return { ok: false, line: `#${snapshot.name} - failed to delete.` };

  const newChannel = await guild.channels
    .create({
      name:                 snapshot.name,
      type:                 snapshot.type,
      topic:                snapshot.topic,
      nsfw:                 snapshot.nsfw,
      rateLimitPerUser:     snapshot.rateLimitPerUser,
      parent:               snapshot.parent,
      position:             snapshot.position,
      permissionOverwrites: snapshot.permissionOverwrites,
      reason:               `Channel nuked by ${invokerUsername}`,
    })
    .catch((): null => null);

  if (!newChannel)
    return { ok: false, line: `#${snapshot.name} - deleted but failed to recreate.` };

  // Post the success notice inside the freshly created channel.
  await sendSuccess(
    { channel: newChannel },
    `This channel was nuked by **${invokerUsername}** and recreated fresh.`,
  );

  return { ok: true, line: `#${snapshot.name} - nuked and recreated.` };
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
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageChannels))
    return sendError(ctx, 'You need the **Manage Channels** permission to nuke a channel.');

  const seen           = new Set<string>();
  const targets: any[] = [];
  const badRefs: string[] = [];

  for (const arg of args) {
    if (CHANNEL_REF.test(arg)) {
      const ch = resolveChannel(guild, arg);
      if (ch && !seen.has(ch.id)) { seen.add(ch.id); targets.push(ch); }
      else if (!ch)                { badRefs.push(arg); }
    }
  }

  if (badRefs.length > 0)
    return sendError(ctx, `Channel${badRefs.length > 1 ? 's' : ''} not found: ${badRefs.join(', ')}`);
  if (targets.length === 0) targets.push(message.channel);

  const list = targets.map((ch: any) => `<#${ch.id}>`).join(', ');
  const description = `Are you sure you want to nuke ${targets.length === 1 ? 'this channel' : `these **${targets.length}** channels`}: ${list}?\n-# Each channel will be deleted and instantly recreated with the same settings.`;

  const confirmId = `nuke:confirm:${message.id}`;
  const cancelId  = `nuke:cancel:${message.id}`;

  const confirmMsg = await message.channel.send(
    buildActionConfirmPayload(confirmId, cancelId, TITLE, description),
  ).catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, message.author.id,
        (cid: string) => cid === confirmId || cid === cancelId,
      ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);

    if (i.customId === cancelId) {
      await confirmMsg
        .edit(buildActionCancelledPayload(confirmId, cancelId, TITLE, description))
        .catch((): null => null);
      setTimeout(() => confirmMsg.delete().catch((): null => null), 3000);
      return;
    }

    await confirmMsg.delete().catch((): null => null);
    await runNuke(message, guild, targets);
  });

  collector.on('end', (_collected: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildActionTimedOutPayload(confirmId, cancelId, TITLE, description))
      .catch((): null => null);
  });
}

async function runNuke(message: any, guild: any, targets: any[]): Promise<void> {
  const invokeChannelId  = message.channel.id as string;
  const invokeChannel    = message.channel;

  // Process sequentially - parallel channel deletes + recreates can race.
  const results: NukeResult[] = [];
  for (const ch of targets) {
    results.push(await nukeOne(ch, guild, message.author.username));
  }

  // Report any failures to the invoking channel, but only if it survived
  // (i.e. it wasn't one of the nuked channels, or it failed and still exists).
  const failures = results.filter(r => !r.ok);
  if (failures.length === 0) return; // all success notices went to the new channels

  // If the invoking channel was nuked successfully it's gone - can't report there.
  // Only send if the channel still exists (i.e. was not successfully nuked).
  const invokeWasNuked = targets.some(
    t => t.id === invokeChannelId && results[targets.indexOf(t)]?.ok,
  );
  if (invokeWasNuked) return;

  const content = failures
    .map(r => `${emojis.redcross} ${r.line}`)
    .join('\n');
  const payload = {
    components: [
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(content),
      ),
    ],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  } as any;
  await invokeChannel.send(payload).catch((): null => null);
}
