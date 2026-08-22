import { config } from '../config.js';
// xoxo/helpers/imagePanel.ts
//
// Reusable helper for sending an image panel with "Send in DM" + "Download" buttons.
//
// Usage:
//   await sendImagePanel({ channel, sendAsReply, title, imageUrl, requesterId, idPrefix });
//
// • sendAsReply — pass `(payload) => interaction.editReply(payload)` for slash commands,
//                 or `null` to send directly to `channel`.
// • The "Send in DM" button becomes disabled after 5 minutes.
// • The "Download" button is a permanent link button.
// • DM sends the full panel (title + image + Download only, no DM button).

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';

function buildPanel(title: string, imageUrl: string, dmCustomId: string, disabled: boolean): any {
  return {
    components: [
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(imageUrl),
          ),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(dmCustomId)
              .setLabel('Send in DM')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(disabled),
            new ButtonBuilder()
              .setURL(imageUrl)
              .setLabel('Download')
              .setStyle(ButtonStyle.Link),
          ),
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function buildDMPanel(title: string, imageUrl: string): any {
  return {
    components: [
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(imageUrl),
          ),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setURL(imageUrl)
              .setLabel('Download')
              .setStyle(ButtonStyle.Link),
          ),
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export async function sendImagePanel({
  channel,
  sendAsReply,
  title,
  imageUrl,
  requesterId,
  idPrefix,
}: {
  channel: any;
  sendAsReply: ((payload: any) => Promise<any>) | null;
  title: string;
  imageUrl: string;
  requesterId: string;
  idPrefix: string;
}): Promise<void> {
  const dmCustomId = `${idPrefix}:dm_${Date.now()}`;

  let msg: any;
  if (sendAsReply) {
    msg = await sendAsReply(buildPanel(title, imageUrl, dmCustomId, false)).catch((): null => null);
  } else {
    msg = await channel.send(buildPanel(title, imageUrl, dmCustomId, false)).catch((): null => null);
  }
  if (!msg) return;

  const collector = msg.createMessageComponentCollector({
    filter: (i: any) => i.customId === dmCustomId && i.user.id === requesterId,
    time: 5 * 60_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    try {
      const dmChannel = await i.user.createDM();
      await dmChannel.send(buildDMPanel(title, imageUrl));
    } catch {
      await i.followUp({
        content: "Couldn't send you a DM. Please make sure your DMs are open.",
        flags: MessageFlags.Ephemeral,
      }).catch((): null => null);
    }
  });

  collector.on('end', async () => {
    await msg.edit(buildPanel(title, imageUrl, dmCustomId, true)).catch((): null => null);
  });
}
