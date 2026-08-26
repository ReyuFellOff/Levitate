import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import { emojis } from '../../emojis.js';

export function buildPrefixInfoPayload(
  serverPrefix: string,
  selfPrefix: string | undefined,
  botId: string,
): object {
  const content = [
    `${emojis.glowyWhiteArrow} Server prefix: ${serverPrefix}`,
    `${emojis.glowyWhiteArrow} Self prefix: ${selfPrefix ?? 'Not set'}`,
    `${emojis.glowyWhiteArrow} <@${botId}> using Mention as prefix`,
  ].join('\n');

  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
