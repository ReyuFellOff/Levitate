import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickWhoWouldWinCaption } from '../config/captions/captionPickers.js';

const resourceRoot = join(dirname(fileURLToPath(import.meta.url)), '../resources');

try { GlobalFonts.loadFontsFromDir('/usr/share/fonts'); } catch { /* ignore */ }
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts/truetype'); } catch { /* ignore */ }
for (const fontName of ['Poppins-Regular.ttf', 'Poppins-SemiBold.ttf', 'Poppins-Bold.ttf']) {
  try {
    GlobalFonts.register(readFileSync(join(resourceRoot, 'fonts', fontName)), 'Poppins');
  } catch { /* bundled font may be unavailable in development */ }
}

const WHO_WOULD_WIN_BACKGROUNDS = [
  '11822017768559824.jpg',
  '8936899258187592.jpg',
  'download (4).jpg',
  'spooky cemetary.jpg',
] as const;

function drawCoverImage(ctx: any, image: any, width: number, height: number): void {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawAvatar(ctx: any, image: any, x: number, y: number, radius: number, winner: boolean): void {
  ctx.save();
  ctx.shadowColor = winner ? 'rgba(255, 205, 72, 0.85)' : 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = winner ? 24 : 14;
  ctx.strokeStyle = winner ? '#ffd34f' : 'rgba(231, 235, 237, 0.92)';
  ctx.lineWidth = winner ? 5 : 3;
  ctx.beginPath();
  ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (image) {
    ctx.clip();
    ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = '#263035';
    ctx.fill();
  }
  ctx.restore();
}

function drawFittedText(ctx: any, text: string, x: number, y: number, maxWidth: number): void {
  let fontSize = 18;
  ctx.font = `600 ${fontSize}px Poppins, sans-serif`;
  while (fontSize > 12 && ctx.measureText(text).width > maxWidth) {
    fontSize -= 1;
    ctx.font = `600 ${fontSize}px Poppins, sans-serif`;
  }
  ctx.fillText(text, x, y);
}

function getParticipantName(participant: any): string {
  return (
    participant.displayName
    ?? participant.globalName
    ?? participant.user?.globalName
    ?? participant.username
    ?? participant.user?.username
    ?? '?'
  ).slice(0, 20);
}

export async function generateWhoWouldWinImage(
  user1: any,
  user2: any,
  winner: 1 | 2,
  caption?: string,
): Promise<Buffer> {
  const W = 640;
  const H = 360;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const backgroundName = WHO_WOULD_WIN_BACKGROUNDS[Math.floor(Math.random() * WHO_WOULD_WIN_BACKGROUNDS.length)];
  const background = await loadImage(join(resourceRoot, 'whowouldwin backgrounds', backgroundName))
    .catch((): null => null);
  ctx.fillStyle = '#101619';
  ctx.fillRect(0, 0, W, H);
  if (background) drawCoverImage(ctx, background, W, H);

  ctx.fillStyle = 'rgba(5, 9, 11, 0.62)';
  ctx.fillRect(0, 0, W, H);
  const spotlight = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, W * 0.7);
  spotlight.addColorStop(0, 'rgba(35, 49, 52, 0.12)');
  spotlight.addColorStop(1, 'rgba(0, 0, 0, 0.68)');
  ctx.fillStyle = spotlight;
  ctx.fillRect(0, 0, W, H);

  const [img1, img2] = await Promise.all([
    loadImage(user1.displayAvatarURL({ forceStatic: true, size: 256, extension: 'png' })).catch((): null => null),
    loadImage(user2.displayAvatarURL({ forceStatic: true, size: 256, extension: 'png' })).catch((): null => null),
  ]);
  const avatarRadius = 75;
  const avatarY = 135;
  const avatarX1 = 155;
  const avatarX2 = W - avatarX1;
  drawAvatar(ctx, img1, avatarX1, avatarY, avatarRadius, winner === 1);
  drawAvatar(ctx, img2, avatarX2, avatarY, avatarRadius, winner === 2);

  ctx.save();
  ctx.strokeStyle = 'rgba(232, 237, 237, 0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 8]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 44);
  ctx.lineTo(W / 2, 252);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.font = 'bold 22px Poppins, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f1c84b';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 8;
  ctx.fillText('VS', W / 2, avatarY);
  ctx.restore();

  const name1 = getParticipantName(user1);
  const name2 = getParticipantName(user2);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = winner === 1 ? '#ffd34f' : '#f0f3f3';
  drawFittedText(ctx, name1, avatarX1, 222, 190);
  ctx.fillStyle = winner === 2 ? '#ffd34f' : '#f0f3f3';
  drawFittedText(ctx, name2, avatarX2, 222, 190);
  ctx.restore();

  const winnerName = winner === 1 ? name1 : name2;
  const imageCaption = caption ?? pickWhoWouldWinCaption();
  ctx.save();
  ctx.fillStyle = 'rgba(5, 9, 11, 0.84)';
  ctx.strokeStyle = 'rgba(255, 211, 79, 0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(155, 263, 330, 40, 9);
  ctx.fill();
  ctx.stroke();
  ctx.font = '600 20px Poppins, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd34f';
  ctx.fillText(`${winnerName} wins`, W / 2, 283);
  ctx.font = 'italic 14px Poppins, sans-serif';
  ctx.fillStyle = 'rgba(239, 243, 243, 0.9)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 3;
  let captionFontSize = 14;
  while (captionFontSize > 11 && ctx.measureText(imageCaption).width > W - 48) {
    captionFontSize -= 1;
    ctx.font = `italic ${captionFontSize}px Poppins, sans-serif`;
  }
  ctx.fillText(imageCaption, W / 2, 326);
  ctx.restore();

  return canvas.toBuffer('image/png');
}