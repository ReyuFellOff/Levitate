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
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { emojis } from '../../emojis.js';

try { GlobalFonts.loadFontsFromDir('/usr/share/fonts'); } catch { /* ignore */ }
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts/truetype'); } catch { /* ignore */ }

/** Deterministic winner: same pair always resolves the same way. */
export function pickWinner(id1: string, id2: string): 1 | 2 {
  const [a, b] = [id1, id2].sort();
  const str = a + b;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return (h % 2 === 0) === (a === id1) ? 1 : 2;
}

async function generateBattleImage(user1: any, user2: any, winner: 1 | 2): Promise<Buffer> {
  const W = 520, H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1a0505');
  bg.addColorStop(0.5, '#2b0a0a');
  bg.addColorStop(1, '#1a0505');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  const avR = 70;
  const av1x = 110, av2x = W - 110, avy = 110;

  const [img1, img2] = await Promise.all([
    loadImage(user1.displayAvatarURL({ forceStatic: true, size: 128, extension: 'png' })).catch((): null => null),
    loadImage(user2.displayAvatarURL({ forceStatic: true, size: 128, extension: 'png' })).catch((): null => null),
  ]);

  for (const [ax, isWinner] of [[av1x, winner === 1], [av2x, winner === 2]] as [number, boolean][]) {
    ctx.save();
    ctx.shadowColor = isWinner ? '#ffd700' : '#7f1d1d';
    ctx.shadowBlur = isWinner ? 22 : 8;
    ctx.strokeStyle = isWinner ? '#ffd700' : '#7f1d1d';
    ctx.lineWidth = isWinner ? 4 : 2;
    ctx.beginPath();
    ctx.arc(ax, avy, avR + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const [ax, img] of [[av1x, img1], [av2x, img2]] as [number, any][]) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, avy, avR, 0, Math.PI * 2);
    if (!img) { ctx.fillStyle = '#3a1010'; ctx.fill(); }
    else { ctx.clip(); ctx.drawImage(img, ax - avR, avy - avR, avR * 2, avR * 2); }
    ctx.restore();
  }

  ctx.save();
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#dc2626';
  ctx.shadowColor = '#dc2626';
  ctx.shadowBlur = 10;
  ctx.fillText('VS', W / 2, avy);
  ctx.restore();

  const name1 = ((user1.globalName ?? user1.username ?? '?') as string).slice(0, 14);
  const name2 = ((user2.globalName ?? user2.username ?? '?') as string).slice(0, 14);

  ctx.save();
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = winner === 1 ? '#ffd700' : '#f5c6c6';
  ctx.fillText(name1, av1x, avy + avR + 12);
  ctx.fillStyle = winner === 2 ? '#ffd700' : '#f5c6c6';
  ctx.fillText(name2, av2x, avy + avR + 12);
  ctx.restore();

  const winnerName = winner === 1 ? name1 : name2;
  ctx.save();
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 8;
  ctx.fillText(`🏆 ${winnerName} wins!`, W / 2, H - 32);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

export async function buildWhoWouldWinPayload(opts: {
  user1: any; user2: any; invokerUsername: string;
}): Promise<any> {
  const { user1, user2, invokerUsername } = opts;
  const winner = pickWinner(user1.id, user2.id);
  const imageBuffer = await generateBattleImage(user1, user2, winner);

  const name1 = (user1.globalName ?? user1.username) as string;
  const name2 = (user2.globalName ?? user2.username) as string;

  const gallery = new MediaGalleryBuilder()
    .addItems(new MediaGalleryItemBuilder().setURL('attachment://whowouldwin.png'));

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blade ?? '⚔️'} Who Would Win: ${name1} vs ${name2}?`),
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
