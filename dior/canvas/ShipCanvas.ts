import { config } from '../config.js';
// xoxo/canvas/ShipCanvas.ts
//
// CV2 payload builder + canvas image generator for the $ship command.

import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emojis } from '../emojis.js';
import { pickCaption, pickSelfCaption } from '../config/captions/captionPickers.js';

// ── Font loading ──────────────────────────────────────────────────────────────
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts'); } catch { /* ignore */ }
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts/truetype'); } catch { /* ignore */ }
for (const fontName of ['Poppins-Regular.ttf', 'Poppins-SemiBold.ttf', 'Poppins-Bold.ttf']) {
  try {
    GlobalFonts.register(
      readFileSync(join(process.cwd(), 'dior', 'resources', 'fonts', fontName)),
      'Poppins',
    );
  } catch { /* bundled font may be unavailable in development */ }
}

const SHIP_BACKGROUNDS = [
  '185632815886525974.jpg',
  'Do u love me.jpg',
  'in my red era fr.jpg',
  'kiss.jpg',
  'Lillies (red filter).jpg',
  'Lillies.jpg',
  '\u2661.jpg',
] as const;

// ── Canvas helpers ────────────────────────────────────────────────────────────

function getLoveLabel(pct: number): string {
  if (pct >= 95) return 'Absolute Soulmates';
  if (pct >= 85) return 'Head Over Heels';
  if (pct >= 70) return 'Deeply in Love';
  if (pct >= 55) return 'Strong Connection';
  if (pct >= 40) return 'Budding Romance';
  if (pct >= 25) return 'Just Friends... for now';
  if (pct >= 10) return 'Barely Compatible';
  return 'Total Opposites';
}

function rrect(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function heartPath(ctx: any, cx: number, cy: number, width: number, height: number): void {
  const halfWidth = width / 2;
  const top = cy - height * 0.45;
  const bottom = cy + height * 0.5;
  const lobeTop = cy - height * 0.18;
  const sideY = cy - height * 0.04;
  ctx.beginPath();
  ctx.moveTo(cx, bottom);
  ctx.bezierCurveTo(
    cx - halfWidth * 0.45, cy + height * 0.18,
    cx - halfWidth, sideY,
    cx - halfWidth, lobeTop,
  );
  ctx.bezierCurveTo(
    cx - halfWidth, top,
    cx - halfWidth * 0.32, top,
    cx, cy - height * 0.16,
  );
  ctx.bezierCurveTo(
    cx + halfWidth * 0.32, top,
    cx + halfWidth, top,
    cx + halfWidth, lobeTop,
  );
  ctx.bezierCurveTo(
    cx + halfWidth, sideY,
    cx + halfWidth * 0.45, cy + height * 0.18,
    cx, bottom,
  );
  ctx.closePath();
}

function fitCaption(ctx: any, caption: string, maxWidth: number): { lines: string[]; fontSize: number } {
  for (let fontSize = 22; fontSize >= 14; fontSize--) {
    ctx.font = `italic ${fontSize}px Poppins, sans-serif`;
    const lines: string[] = [];
    for (const word of caption.trim().split(/\s+/)) {
      const current = lines[lines.length - 1] ?? '';
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        if (current) lines[lines.length - 1] = candidate;
        else lines.push(candidate);
      } else if (lines.length < 2) {
        lines.push(word);
      }
    }
    if (lines.length <= 2 && lines.every((line) => ctx.measureText(line).width <= maxWidth)) {
      return { lines, fontSize };
    }
  }
  ctx.font = 'italic 14px Poppins, sans-serif';
  let line = caption.trim();
  while (line.length > 1 && ctx.measureText(`${line}...`).width > maxWidth) line = line.slice(0, -1);
  return { lines: [`${line}...`], fontSize: 14 };
}

// ── Canvas image generator ────────────────────────────────────────────────────

async function generateShipImage(user1: any, user2: any, pct: number, caption: string): Promise<Buffer> {
  const W = 600, H = 320;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── Background — one of the saved romantic textures ──────────────────────
  const backgroundName = SHIP_BACKGROUNDS[Math.floor(Math.random() * SHIP_BACKGROUNDS.length)];
  const background = await loadImage(
    join(process.cwd(), 'dior', 'resources', 'shipbackgrounds', backgroundName),
  ).catch((): null => null);
  ctx.fillStyle = '#f4dfe2';
  ctx.fillRect(0, 0, W, H);
  if (background) {
    const scale = Math.max(W / background.width, H / background.height);
    const drawW = background.width * scale;
    const drawH = background.height * scale;
    ctx.drawImage(background, (W - drawW) / 2, (H - drawH) / 2, drawW, drawH);
  }

  // Soft wash keeps the background visible without competing with the card.
  ctx.fillStyle = 'rgba(255, 248, 248, 0.58)';
  ctx.fillRect(0, 0, W, H);

  // ── Avatar config ─────────────────────────────────────────────────────────
  const avatarSize = 114;
  const avatarRadius = 22;
  const av1x = 143, av2x = W - 143, avy = 105;
  const cx = W / 2;

  const [img1, img2] = await Promise.all([
    loadImage(user1.displayAvatarURL({ forceStatic: true, size: 128, extension: 'png' }))
      .catch((): null => null),
    loadImage(user2.displayAvatarURL({ forceStatic: true, size: 128, extension: 'png' }))
      .catch((): null => null),
  ]);

  // White rounded-square borders with a warm pink glow.
  for (const ax of [av1x, av2x]) {
    ctx.save();
    ctx.shadowColor = 'rgba(151, 45, 74, 0.48)';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.lineWidth = 4;
    rrect(ctx, ax - avatarSize / 2 - 2, avy - avatarSize / 2 - 2, avatarSize + 4, avatarSize + 4, avatarRadius + 2);
    ctx.stroke();
    ctx.restore();
  }

  // Draw rounded-square avatars.
  for (const [ax, img] of [[av1x, img1], [av2x, img2]] as [number, any][]) {
    ctx.save();
    rrect(ctx, ax - avatarSize / 2, avy - avatarSize / 2, avatarSize, avatarSize, avatarRadius);
    if (!img) {
      ctx.fillStyle = 'rgba(145, 145, 145, 0.85)';
      ctx.fill();
    } else {
      ctx.clip();
      ctx.drawImage(img, ax - avatarSize / 2, avy - avatarSize / 2, avatarSize, avatarSize);
    }
    ctx.restore();
  }

  // ── Heart shape and percentage ────────────────────────────────────────────
  ctx.save();
  ctx.shadowColor = 'rgba(115, 34, 54, 0.42)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = 'rgba(190, 105, 123, 0.72)';
  heartPath(ctx, cx, 123, 156, 178);
  ctx.fill();
  ctx.restore();

  // Percentage sits over the heart; the short label stays inside its lower half.
  ctx.save();
  ctx.font = 'bold 28px Poppins, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#191316';
  ctx.fillText(`${pct}%`, cx, 119);
  ctx.restore();

  // ── Names ──────────────────────────────────────────────────────────────────
  const name1 = ((user1.globalName ?? user1.username ?? '?') as string).slice(0, 18);
  const name2 = ((user2.globalName ?? user2.username ?? '?') as string).slice(0, 18);
  ctx.save();
  ctx.font = '600 17px Poppins, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#241a1d';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
  ctx.shadowBlur = 3;
  ctx.fillText(name1, av1x, avy + avatarSize / 2 + 15);
  ctx.fillText(name2, av2x, avy + avatarSize / 2 + 15);
  ctx.restore();

  // ── Short compatibility label ────────────────────────────────────────────
  ctx.save();
  ctx.font = '600 13px Poppins, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 238, 244, 0.98)';
  ctx.shadowColor = 'rgba(177, 46, 91, 0.92)';
  ctx.shadowBlur = 15;
  ctx.fillText(getLoveLabel(pct), cx, 137);
  ctx.fillStyle = '#000000';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.75)';
  ctx.shadowBlur = 2;
  ctx.fillText(getLoveLabel(pct), cx, 137);
  ctx.restore();

  // ── Long caption ──────────────────────────────────────────────────────────
  const captionLayout = fitCaption(ctx, caption, W - 36);
  ctx.save();
  ctx.font = `italic ${captionLayout.fontSize}px Poppins, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const captionStartY = 267 - ((captionLayout.lines.length - 1) * 13);
  ctx.fillStyle = 'rgba(255, 238, 244, 0.98)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
  ctx.shadowBlur = 5;
  captionLayout.lines.forEach((line, index) => ctx.fillText(line, cx, captionStartY + index * 26));
  ctx.fillStyle = '#392027';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.86)';
  ctx.shadowBlur = 3;
  captionLayout.lines.forEach((line, index) => ctx.fillText(line, cx, captionStartY + index * 26));
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// ── Public payload builder ────────────────────────────────────────────────────

export async function buildShipPayload(opts: {
  user1:           any;
  user2:           any;
  pct:             number;
  isSelf:          boolean;
  invokerUsername: string;
}): Promise<any> {
  const { user1, user2, pct, isSelf, invokerUsername } = opts;

  const name1 = (user1.globalName ?? user1.username) as string;
  const name2 = (user2.globalName ?? user2.username) as string;

  const title = isSelf
    ? `## ${emojis.pinkHearts} **Shipping <@${user1.id}> with themself**`
    : `## ${emojis.pinkHearts} **Shipping <@${user1.id}> with <@${user2.id}>**`;

  const imageCaption = isSelf
    ? pickSelfCaption()
    : pickCaption(pct);
  const caption = isSelf
    ? pickSelfCaption()
    : pickCaption(pct);

  const imageBuffer = await generateShipImage(user1, user2, pct, imageCaption);

  const gallery = new MediaGalleryBuilder()
    .addItems(new MediaGalleryItemBuilder().setURL('attachment://ship.png'));

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${title}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`*${caption}*`),
    )
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Requested by ${invokerUsername}`),
    );

  return {
    components:      [container],
    files:           [{ attachment: imageBuffer, name: 'ship.png' }],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
