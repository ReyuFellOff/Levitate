import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../../config.js';

function value(text: string | null | undefined): string {
  return text ? `\`${text}\`` : '*Not set*';
}

export function buildAutonickStatusPayload(settings: any): object {
  const humans = [
    '**Prepend:** ' + value(settings?.member_prepend ?? settings?.prepend),
    '**Append:** ' + value(settings?.member_append ?? settings?.append),
  ].join('\n');
  const bots = [
    '**Prepend:** ' + value(settings?.bot_prepend),
    '**Append:** ' + value(settings?.bot_append),
  ].join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Autonick Settings'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Members**\n${humans}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Bots**\n${bots}`));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
