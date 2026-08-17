// xoxo/commands/info/uptime.ts
//
// $uptime — Shows how long the bot has been online. Short CV2 response.

import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';

export const options = {
  name:        'uptime',
  aliases:     [] as string[],
  description: 'Shows how long the bot has been online.',
  usage:       'uptime',
  category:    'info',
  owner:       false,
  cooldown:    3,
};

function buildPayload(client: LevitateClient): object {
  const ts = client.readyTimestamp
    ? Math.floor(client.readyTimestamp / 1000)
    : Math.floor((Date.now() - (client.uptime ?? 0)) / 1000);

  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `Online since <t:${ts}:R> · <t:${ts}:f>`,
    ),
  );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  LevitateClient,
): Promise<any> {
  return message.channel.send(buildPayload(client));
}

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  return interaction.reply(buildPayload(client));
}
