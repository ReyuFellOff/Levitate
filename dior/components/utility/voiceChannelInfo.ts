import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import { emojis } from '../../emojis.js';

function timestamp(value: number | null | undefined): string {
  return value ? `<t:${Math.floor(value / 1000)}:F> (<t:${Math.floor(value / 1000)}:R>)` : 'Unknown';
}

function formatBitrate(value: number | null | undefined): string {
  return value ? `${Math.floor(value / 1000)} kbps` : 'Unknown';
}

export function buildVoiceChannelInfoPayload(channel: any): object {
  const members = [...(channel.members?.values?.() ?? [])];
  const memberLine = members.length
    ? members.map((member: any) => `<@${member.id}>`).join(', ')
    : 'No members';
  const category = channel.parent?.name ? `#${channel.parent.name}` : 'None';
  const region = channel.rtcRegion ?? 'Automatic';
  const userLimit = channel.userLimit > 0 ? channel.userLimit : 'Infinite';

  const lines = [
    `${emojis.whiteArrow} **__Voice Channel Info__**`,
    `**Name:** ${channel.name}`,
    `**Channel ID:** \`${channel.id}\``,
    `**Created:** ${timestamp(channel.createdTimestamp)}`,
    `**Category:** ${category}`,
    `**Bitrate:** ${formatBitrate(channel.bitrate)}`,
    `**Region:** ${region}`,
    `**User Limit:** ${userLimit}`,
    `**Members in VC:** ${members.length}`,
    `**Connected:** ${memberLine}`,
  ].join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.blackcrown} ${channel.name} — Voice Channel`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
