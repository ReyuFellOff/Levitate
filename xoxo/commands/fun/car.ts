// xoxo/commands/fun/car.ts
//
// $car — show a random car image.

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

const API_URL = 'https://api.popcat.xyz/v2/car';
const REQUEST_TIMEOUT_MS = 10_000;

type CarResponse = {
  error?: boolean;
  message?: {
    image?: string;
    title?: string;
  };
};

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[\[(]\s*\d{2,5}\s*[x×]\s*\d{2,5}\s*[\])]\s*$/i, '')
    .replace(/\s+\d{2,5}\s*[x×]\s*\d{2,5}\s*$/i, '')
    .trim() || 'Random Car';
}

function buildPayload(title: string, imageUrl: string): any {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emojis.Car} ${title}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imageUrl),
      ),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export const options = {
  name: 'car',
  aliases: [] as string[],
  description: 'Show a random car image.',
  usage: 'car',
  category: 'fun',
  owner: false,
  cooldown: 5,
};

export async function prefixExecute(
  message: any,
  _args: string[],
  _client: LevitateClient,
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      headers: { 'User-Agent': 'Levitate Discord Bot/1.0' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = await response.json() as CarResponse;
    const imageUrl = body.message?.image;
    if (body.error || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      throw new Error('API did not return a valid car image');
    }

    return message.channel.send(
      buildPayload(cleanTitle(body.message?.title ?? ''), imageUrl),
    );
  } catch {
    return sendError({ message }, 'Could not fetch a car image right now. Please try again later.');
  } finally {
    clearTimeout(timeout);
  }
}