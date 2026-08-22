import { config } from '../../config.js';
// xoxo/commands/utility/firstmessage.ts
//
// Prefix: $firstmessage  |  $firstmsg
// Slash:  /firstmessage

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { emojis } from '../../emojis.js';

export const options = {
  name:        'firstmessage',
  aliases:     ['firstmsg'] as string[],
  description: 'Get details about the first message ever sent in this channel.',
  usage:       'firstmessage',
  category:    'miscellaneous',
  owner:       false,
  cooldown:    5,
};

async function fetchFirstMessage(channel: any): Promise<any | null> {
  try {
    const fetched = await channel.messages.fetch({ after: '0', limit: 1 });
    return fetched.first?.() ?? null;
  } catch {
    return null;
  }
}

function buildPayload(msg: any): object {
  const unixSec = Math.floor(msg.createdTimestamp / 1000);

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.greenSparkles} First Message`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Author:** <@${msg.author.id}>\n` +
        `**Time:** <t:${unixSec}:F>`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Jump to Message')
          .setStyle(ButtonStyle.Link)
          .setURL(msg.url),
      ),
    );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export async function prefixExecute(message: any, _args: string[], _client: LevitateClient): Promise<any> {
  const first = await fetchFirstMessage(message.channel);
  if (!first) return sendError({ message }, 'Could not fetch the first message in this channel.');
  await message.channel.send(buildPayload(first));
}

export async function slashExecute(interaction: any, _client: LevitateClient): Promise<any> {
  await interaction.deferReply();
  const first = await fetchFirstMessage(interaction.channel);
  if (!first) return sendError({ interaction }, 'Could not fetch the first message in this channel.');
  await interaction.editReply(buildPayload(first));
}
