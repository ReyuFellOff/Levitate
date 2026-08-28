import { config } from '../../config.js';
// xoxo/components/fun/whowouldwin.ts
//
// CV2 payload builder + canvas image generator for the $whowouldwin command.
// Side-by-side avatar "battle" composite with a deterministic winner pick.

import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';
import { generateWhoWouldWinImage } from '../../canvas/WhoWouldWinCanvas.js';
import { getWhoWouldWinBotCaption } from '../../config/captions/captionPickers.js';

/** Deterministic winner: same pair always resolves the same way. */
export function pickWinner(id1: string, id2: string): 1 | 2 {
  const [a, b] = [id1, id2].sort();
  const str = a + b;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return (h % 2 === 0) === (a === id1) ? 1 : 2;
}

async function getGuildMember(guild: any, user: any): Promise<any | null> {
  if (!guild) return null;
  return guild.members.fetch(user.id).catch((): null => null);
}

export async function buildWhoWouldWinPayload(opts: {
  user1: any; user2: any; guild?: any; botId?: string; invokerUsername: string;
}): Promise<any> {
  const { user1, user2, guild, botId, invokerUsername } = opts;
  const botIsUser1 = user1.id === botId;
  const botIsUser2 = user2.id === botId;
  const winner = botIsUser1 ? 1 : botIsUser2 ? 2 : pickWinner(user1.id, user2.id);
  const [member1, member2] = await Promise.all([
    getGuildMember(guild, user1),
    getGuildMember(guild, user2),
  ]);
  const participant1 = member1 ?? user1;
  const participant2 = member2 ?? user2;

  const imageBuffer = await generateWhoWouldWinImage(
    participant1,
    participant2,
    winner,
    (botIsUser1 || botIsUser2) ? getWhoWouldWinBotCaption(config.botName) : undefined,
  );

  const gallery = new MediaGalleryBuilder()
    .addItems(new MediaGalleryItemBuilder().setURL('attachment://whowouldwin.png'));

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.whoWouldWin ?? '⚔️'} Who Would Win: <@${user1.id}> vs <@${user2.id}>?`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Requested by ${invokerUsername}`),
    );

  return {
    components:      [container],
    files:           [{ attachment: imageBuffer, name: 'whowouldwin.png' }],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
