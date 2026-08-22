import { config } from '../../config.js';
// xoxo/components/fun/ship.ts
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
import { emojis } from '../../emojis.js';
import { pickCaption, pickSelfCaption } from '../../config/captions/captionPickers.js';

// ── Font loading ──────────────────────────────────────────────────────────────
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts'); } catch { /* ignore */ }
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts/truetype'); } catch { /* ignore */ }

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

// ── Canvas image generator ────────────────────────────────────────────────────

async function generateShipImage(user1: any, user2: any, pct: number): Promise<Buffer> {
  const W = 500, H = 250;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── Background — very dark, muted purple ──────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,    '#0c0515');
  bg.addColorStop(0.5,  '#180d2e');
  bg.addColorStop(1,    '#0c0515');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Subtle star dots
  const stars = [
    [30, 22], [460, 18], [470, 220], [18, 200], [248, 12], [250, 232],
    [110, 218], [390, 225], [58, 125], [440, 118],
  ];
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (const [sx, sy] of stars) {
    ctx.beginPath();
    ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Avatar config ─────────────────────────────────────────────────────────
  const avR = 63;
  const av1x = 96, av2x = W - 96, avy = 116;
  const cx = W / 2;

  const [img1, img2] = await Promise.all([
    loadImage(user1.displayAvatarURL({ forceStatic: true, size: 128, extension: 'png' }))
      .catch((): null => null),
    loadImage(user2.displayAvatarURL({ forceStatic: true, size: 128, extension: 'png' }))
      .catch((): null => null),
  ]);

  // Glow rings — muted, low blur
  for (const ax of [av1x, av2x]) {
    ctx.save();
    ctx.shadowColor = '#7c3aed';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#6d28d9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ax, avy, avR + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Draw circular avatars
  for (const [ax, img] of [[av1x, img1], [av2x, img2]] as [number, any][]) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, avy, avR, 0, Math.PI * 2);
    if (!img) {
      ctx.fillStyle = '#2e1a4a';
      ctx.fill();
    } else {
      ctx.clip();
      ctx.drawImage(img, ax - avR, avy - avR, avR * 2, avR * 2);
    }
    ctx.restore();
  }

  // Dashed connector between avatars
  ctx.save();
  ctx.setLineDash([3, 6]);
  ctx.strokeStyle = 'rgba(139,92,246,0.22)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(av1x + avR + 8, avy);
  ctx.lineTo(av2x - avR - 8, avy);
  ctx.stroke();
  ctx.restore();

  // ── Heart ─────────────────────────────────────────────────────────────────
  ctx.save();
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#be185d';
  ctx.shadowColor = '#be185d';
  ctx.shadowBlur = 8;
  ctx.fillText('\u2665', cx, avy - 52);
  ctx.restore();

  // ── Percentage text ───────────────────────────────────────────────────────
  ctx.save();
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#7c3aed';
  ctx.shadowBlur = 12;
  const pctGrad = ctx.createLinearGradient(cx - 50, 0, cx + 50, 0);
  pctGrad.addColorStop(0, '#c084fc');
  pctGrad.addColorStop(1, '#818cf8');
  ctx.fillStyle = pctGrad;
  ctx.fillText(`${pct}%`, cx, avy - 12);
  ctx.restore();

  // ── Love label ────────────────────────────────────────────────────────────
  ctx.save();
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#a78bfa';
  ctx.fillText(getLoveLabel(pct), cx, avy + 16);
  ctx.restore();

  // ── Love bar ──────────────────────────────────────────────────────────────
  const barW = 148, barH = 10, barY = avy + 38;
  const barX = cx - barW / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  rrect(ctx, barX, barY, barW, barH, 5);
  ctx.fill();
  ctx.restore();

  const fillW = Math.max(barW * pct / 100, 10);
  const barFill = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  barFill.addColorStop(0, '#7c3aed');
  barFill.addColorStop(1, '#6d28d9');
  ctx.save();
  ctx.shadowColor = '#6d28d9';
  ctx.shadowBlur = 6;
  ctx.fillStyle = barFill;
  rrect(ctx, barX, barY, fillW, barH, 5);
  ctx.fill();
  ctx.restore();

  // ── Display names ─────────────────────────────────────────────────────────
  const name1 = ((user1.globalName ?? user1.username ?? '?') as string).slice(0, 14);
  const name2 = ((user2.globalName ?? user2.username ?? '?') as string).slice(0, 14);

  ctx.save();
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#c4b5fd';
  ctx.fillText(name1, av1x, avy + avR + 10);
  ctx.fillText(name2, av2x, avy + avR + 10);
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

  const imageBuffer = await generateShipImage(user1, user2, pct);

  const name1 = (user1.globalName ?? user1.username) as string;
  const name2 = (user2.globalName ?? user2.username) as string;

  const title = isSelf
    ? `## ${emojis.pinkHearts} **Shipping ${name1} with themself**`
    : `## ${emojis.pinkHearts} **Shipping ${name1} with ${name2}**`;

  const caption = isSelf
    ? pickSelfCaption()
    : pickCaption(pct);

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
