// xoxo/commands/utility/vcinfo.ts
//
// Shows detailed information about a regular voice channel.

import type { CassieClient } from '../../structures/CassieClient.js';
import { ChannelType } from 'discord.js';
import { sendError } from '../../components/statusMessages.js';
import { buildVoiceChannelInfoPayload } from '../../components/utility/voiceChannelInfo.js';
import { resolveVoiceChannel } from '../../helpers/voiceChannelResolver.js';

export const options = {
  name: 'vcinfo',
  aliases: ['voiceinfo'] as string[],
  description: 'Show detailed information about a voice channel.',
  usage: 'vcinfo <voice channel mention | ID | name>',
  category: 'utility',
  owner: false,
  cooldown: 5,
};

export async function prefixExecute(
  message: any,
  args: string[],
  _client: CassieClient,
): Promise<any> {
  const ctx = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!args.length) return sendError(ctx, `Usage: \`${options.usage}\``);

  const channel = resolveVoiceChannel(guild, args.join(' '));
  if (!channel) {
    return sendError(ctx, 'Voice channel not found. Use a voice-channel mention, ID, or name.');
  }

  return message.channel.send(buildVoiceChannelInfoPayload(channel));
}

export async function slashExecute(
  interaction: any,
  _client: CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const guild = interaction.guild;
  if (!guild) return sendError({ interaction }, 'This command can only be used in a server.');

  const channel = interaction.options.getChannel('channel', true);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    return sendError({ interaction }, 'Voice channel not found.');
  }

  return interaction.editReply(buildVoiceChannelInfoPayload(channel));
}
