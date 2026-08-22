import { config } from '../../config.js';
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { emojis } from '../../emojis.js';

export function buildDeveloperOutput(title: string, output: string, success = true): any {
  const icon = success ? emojis.greentick : emojis.redcross;
  const safeOutput = output.length > 7_500 ? `${output.slice(0, 7_500)}\n… [output truncated]` : output;
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${icon} ${title}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`text\n${safeOutput}\n\`\`\``));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}