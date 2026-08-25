import { config } from '../../config.js';
// xoxo/commands/utility/reactionsnipe.ts
//
// Show the last removed reaction in a channel.
// Stores one per channel in memory (no database).
//
// Usage:
//   $reactionsnipe             — last removed reaction in current channel
//   $reactionsnipe #channel    — last removed reaction in another channel

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient }  from '../../structures/CassieClient.js';
import { sendError }             from '../../components/statusMessages.js';
import { getReactionSnipe }      from '../../components/moderation/snipeStore.js';
import { emojis }                from '../../emojis.js';

export const options = {
  name:        'reactionsnipe',
  aliases:     ['rs', 'rsnipe'] as string[],
  description: 'Show the last removed reaction in a channel.',
  usage:       'reactionsnipe [#channel]',
  category:    'utility',
  owner:       false,
  cooldown:    3,
};

function buildReactionSnipePayload(snipe: import('../../components/moderation/snipeStore.js').SnipedReaction): any {
  const removedSec = Math.floor(snipe.removedAt / 1000);

  // Format the emoji for display in text (unicode emojis already display fine;
  // custom emoji IDs need the full <:name:id> / <a:name:id> form)
  const emojiDisplay = snipe.emojiId
    ? (snipe.emojiAnimated
        ? `<a:${snipe.emoji.match(/:(\w+):/)?.[1] ?? 'emoji'}:${snipe.emojiId}>`
        : `<:${snipe.emoji.match(/:(\w+):/)?.[1] ?? 'emoji'}:${snipe.emojiId}>`)
    : snipe.emoji;

  const infoLines = [
    `${emojis.whiteArrow} **__Reaction Snipe__**`,
    `**Emoji:** ${emojiDisplay}  (${snipe.emoji})`,
    `**Removed by:** <@${snipe.userId}> (\`${snipe.userName}\`)`,
    `**Message:** [Jump to message](https://discord.com/channels/${snipe.guildId}/${snipe.channelId}/${snipe.messageId})`,
    snipe.messageAuthorId ? `**Message author:** <@${snipe.messageAuthorId}>` : null,
    snipe.messageContent  ? `**Message preview:** ${snipe.messageContent.slice(0, 200)}` : null,
    `**Removed:** <t:${removedSec}:R> (<t:${removedSec}:f>)`,
  ].filter(Boolean).join('\n');

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.blackCards} Reaction Snipe — <#${snipe.channelId}>`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (snipe.userAvatar) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(snipe.userAvatar)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines));
  }

  // Link button to the message
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setURL(`https://discord.com/channels/${snipe.guildId}/${snipe.channelId}/${snipe.messageId}`)
        .setLabel('Jump to Message')
        .setStyle(ButtonStyle.Link),
    ),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Reaction snipe data is lost when the bot restarts.'),
  );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export async function prefixExecute(
  message: any,
  args:    string[],
  _client: CassieClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  let targetChannelId = message.channelId as string;

  // Optional channel argument
  const firstArg = args[0];
  if (firstArg) {
    const mentionMatch = firstArg.match(/^<#(\d+)>$/);
    const idMatch      = /^\d{17,20}$/.test(firstArg);
    if (mentionMatch || idMatch) {
      const channelId = mentionMatch ? mentionMatch[1] : firstArg;
      const ch = message.guild.channels.cache.get(channelId);
      if (!ch) return sendError(ctx, `Could not find channel \`${firstArg}\` in this server.`);
      targetChannelId = channelId;
    }
  }

  const snipe = getReactionSnipe(targetChannelId);

  if (!snipe) {
    return sendError(
      ctx,
      targetChannelId === message.channelId
        ? 'No recently removed reactions found in this channel.'
        : `No recently removed reactions found in <#${targetChannelId}>.`,
    );
  }

  return message.channel.send(buildReactionSnipePayload(snipe));
}
