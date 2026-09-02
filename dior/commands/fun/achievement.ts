import { config } from '../../config.js';
import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { emojis } from '../../emojis.js';

const API_URL = 'https://api.popcat.xyz/v2/achievement';
const REQUEST_TIMEOUT_MS = 10_000;

function buildPayload(imageBuffer: Buffer): any {
  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${emojis.redMinecraftHeart} Achievement Unlocked`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://achievement.png'),
      ),
    );

  return {
    components: [container],
    files: [{ attachment: imageBuffer, name: 'achievement.png' }],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export const options = {
  name: 'achievement',
  aliases: ['minecraftachievement'] as string[],
  description: 'Create a Minecraft-style achievement image.',
  usage: 'achievement <text>',
  category: 'fun',
  owner: false,
  cooldown: 5,
};

async function createAchievement(text: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}?text=${encodeURIComponent(text)}`, {
      headers: { 'User-Agent': 'Cassie Discord Bot/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) throw new Error('API did not return an image');
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    if (!imageBuffer.length) throw new Error('API returned an empty image');
    return imageBuffer;
  } finally {
    clearTimeout(timeout);
  }
}

export async function prefixExecute(
  message: any,
  args: string[],
  _client: CassieClient,
): Promise<any> {
  const text = args.join(' ').trim();
  if (!text) return sendError({ message }, 'Please provide achievement text. Usage: `$achievement <text>`');

  try {
    return message.channel.send(buildPayload(await createAchievement(text)));
  } catch {
    return sendError({ message }, 'Could not create the achievement right now. Please try again later.');
  }
}

export async function slashExecute(
  interaction: any,
  _client: CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const text = interaction.options.getString('text', true).trim();
  try {
    return interaction.editReply(buildPayload(await createAchievement(text)));
  } catch {
    return sendError({ interaction }, 'Could not create the achievement right now. Please try again later.');
  }
}
