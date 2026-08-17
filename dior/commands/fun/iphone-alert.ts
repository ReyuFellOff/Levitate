// xoxo/commands/fun/iphone-alert.ts
//
// $iphone-alert <text> — generate an iPhone presidential alert image.

import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { emojis } from '../../emojis.js';

const API_URL = 'https://api.popcat.xyz/v2/alert';
const REQUEST_TIMEOUT_MS = 10_000;

function buildPayload(imageBuffer: Buffer): any {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emojis.FIRE} Presidential Alert`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://iphone-alert.png'),
      ),
    );

  return {
    components: [container],
    files: [{ attachment: imageBuffer, name: 'iphone-alert.png' }],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export const options = {
  name: 'iphone-alert',
  aliases: [] as string[],
  description: 'Create an iPhone presidential alert image.',
  usage: 'iphone-alert <text>',
  category: 'fun',
  owner: false,
  cooldown: 5,
};

export async function prefixExecute(
  message: any,
  args: string[],
  _client: LevitateClient,
): Promise<any> {
  const text = args.join(' ').trim();
  if (!text) {
    return sendError({ message }, 'Please provide alert text. Usage: `$iphone-alert <text>`');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}?text=${encodeURIComponent(text)}`, {
      headers: { 'User-Agent': 'Levitate Discord Bot/1.0' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw new Error('API did not return an image');
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    if (!imageBuffer.length) throw new Error('API returned an empty image');

    return message.channel.send(buildPayload(imageBuffer));
  } catch {
    return sendError({ message }, 'Could not create the presidential alert right now. Please try again later.');
  } finally {
    clearTimeout(timeout);
  }
}