// xoxo/commands/info/host.ts
//
// $host — Show where the bot is hosted, along with minor tech details.

import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import type { LevitateClient }       from '../../structures/LevitateClient.js';
import { getHostingProviderName }    from '../../helpers/getHostingServiceIP.js';
import { config }                    from '../../config.js';
import { emojis }                    from '../../emojis.js';

export const options = {
  name:        'host',
  aliases:     ['hosting', 'hoster'] as string[],
  description: 'Shows where the bot is hosted and some technical details.',
  usage:       'host',
  category:    'info',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  LevitateClient,
): Promise<any> {
  const provider = getHostingProviderName();
  const avatar   = client.user?.displayAvatarURL({ size: 256 }) ?? null;
  const uptime   = client.uptime
    ? `<t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`
    : 'Unknown';

  const lines = [
    `## ${emojis.whiteArrow} Hosting Info`,
    `**Host:** ${provider}`,
    `**Database:** ${config.databaseProvider}`,
    `**Language:** ${config.language}`,
    `**Uptime:** ${uptime}`,
  ].join('\n');

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));

  if (avatar) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${config.botName} — running on ${provider}`,
    ),
  );

  return message.channel.send({
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}
