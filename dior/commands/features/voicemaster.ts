// xoxo/commands/features/voicemaster.ts
//
// Prefix-only VoiceMaster setup. There is intentionally no matching slash
// command: the persistent panel itself is the user-facing control surface.

import { ChannelType } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import {
  createVoiceMasterSetup,
  deleteVoiceMasterSetup,
  getVoiceMasterSetup,
  migrateVoiceMasterSetup,
  resolveGuildPrefix,
} from '../../helpers/voiceMaster.js';

export const options = {
  name: 'voicemaster',
  aliases: ['vm'],
  description: 'Set up or manage temporary personal voice channels.',
  usage: 'voicemaster <setup [text-channel]|reset|status>',
  category: 'features',
  owner: false,
  cooldown: 5,
};

export async function prefixExecute(
  message: any,
  args: string[],
  client: LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const prefix = await resolveGuildPrefix(client, message.guild.id);
  const permissions = message.member?.permissions;
  if (!permissions?.has?.('Administrator')) {
    return sendError(ctx, 'You need the **Administrator** permission to configure VoiceMaster.');
  }

  const action = (args[0] ?? 'status').toLowerCase();
  if (action === 'status') {
    const setup = await getVoiceMasterSetup(client, message.guild.id);
    if (!setup) return sendInfo(ctx, 'VoiceMaster is not set up in this server.');
    return sendInfo(
      ctx,
      `VoiceMaster is active. Join <#${setup.join_channel_id}> to create a temporary channel. ` +
      `Control panel: <#${setup.control_channel_id}>.`,
    );
  }

  if (action === 'setup') {
    if (args.length > 2) {
      return sendError(ctx, `Usage: \`${prefix}voicemaster setup [text-channel]\`.`);
    }
    const channelArg = args[1];
    let controlChannel: any = null;
    if (channelArg) {
      const match = channelArg.match(/^<#(\d+)>$/) ?? channelArg.match(/^(\d{17,20})$/);
      controlChannel = match
        ? message.guild.channels.cache.get(match[1]) ?? null
        : null;
      if (!controlChannel || controlChannel.type !== ChannelType.GuildText) {
        return sendError(ctx, 'Setup requires a strictly text channel, for example `<#channel-id>`.');
      }
    }

    const existing = await getVoiceMasterSetup(client, message.guild.id);
    if (existing) {
      try {
        await migrateVoiceMasterSetup(client, message.guild);
        return sendInfo(
          ctx,
          'VoiceMaster is already set up in this server.',
        );
      } catch (error: unknown) {
        return sendError(
          ctx,
          error instanceof Error ? error.message : 'The existing VoiceMaster setup could not be updated.',
        );
      }
    }

    try {
      const setup = await createVoiceMasterSetup(client, message.guild, controlChannel);
      return sendSuccess(
        ctx,
        `VoiceMaster is ready. Join <#${setup.join_channel_id}> to create your temporary voice channel. ` +
        `The control panel is in <#${setup.control_channel_id}>.`,
      );
    } catch (error: unknown) {
      return sendError(
        ctx,
        error instanceof Error ? error.message : 'VoiceMaster setup failed.',
      );
    }
  }

  if (action === 'reset') {
    try {
      await deleteVoiceMasterSetup(client, message.guild);
      return sendSuccess(ctx, 'VoiceMaster has been reset and its managed channels were removed.');
    } catch (error: unknown) {
      return sendError(
        ctx,
        error instanceof Error ? error.message : 'VoiceMaster reset failed.',
      );
    }
  }

  return sendInfo(ctx, `Usage: \`${prefix}voicemaster setup [text-channel]\`, \`${prefix}voicemaster status\`, or \`${prefix}voicemaster reset\`.`);
}
