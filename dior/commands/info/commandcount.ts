import { config } from '../../config.js';
import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { emojis } from '../../emojis.js';

export const options = {
  name:        'commandcount',
  aliases:     ['cc'] as string[],
  description: 'Shows the number of commands in the bot.',
  usage:       'commandcount',
  category:    'info',
  owner:       false,
  cooldown:    3,
};

export async function prefixExecute(
  message: any,
  _args: string[],
  client: LevitateClient,
): Promise<any> {
  const allCommands = new Map<string, any>();
  for (const command of [
    ...client.commands.values(),
    ...client.slashCommands.values(),
  ]) {
    const name = command.options?.name;
    if (name) allCommands.set(name, command);
  }

  const categories = new Set(
    [...allCommands.values()]
      .map((command: any) => command.options?.category)
      .filter(Boolean),
  );

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${emojis.silveryButterfly} **${allCommands.size} commands** across **${categories.size} categories**.`,
    ),
  );

  return message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}