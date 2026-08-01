// xoxo/structures/NowPlayingCanvas.ts
//
// Generates the custom now-playing card image for the music player.
//
// Layout (900 × 280):
//   • Full-canvas album art, desaturated + darkened, as atmospheric background
//   • Left: coloured album art thumbnail in a rounded rect (200×200)
//   • Right panel: NOW PLAYING label → title → artist → wavy seek bar →
//     time stamps → volume / requester row
//   • Bottom-right: "Powered by {botName}"
//
// The seek bar is a sine-wave path; the filled/unfilled portions are drawn
// as two separate strokes split at the progress position. A glowing dot marks
// the playhead on the wave.

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { botName } from '../config.js';

// ── Font loading ───────────────────────────────────────────────────────────────
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts'); } catch { /* ignore */ }
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts/truetype'); } catch { /* ignore */ }

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NowPlayingCanvasOptions {
  title:             string;
  artist:            string;
  currentFormatted:  string;
  durationFormatted: string;
  /** 0–100 */
  progress:          number;
  volume:            number;
  requestedBy?:      string;
  thumbnailUrl?:     string;
  isLive?:           boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function truncate(str: string, max: number): string {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

/** Draw a rounded-rectangle PATH (no fill/stroke — caller decides). */
function roundRectPath(
  ctx:  any,
  x:    number, y: number,
  w:    number, h: number,
  r:    number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r,  y + h);
  ctx.quadraticCurveTo(x,     y + h, x,     y + h - r);
  ctx.lineTo(x,  y + r);
  ctx.quadraticCurveTo(x,     y,     x + r, y);
  ctx.closePath();
}

/** Y position on the seek-bar sine wave at canvas-x `x`. */
function waveY(
  x:         number,
  barX1:     number,
  barWidth:  number,
  barCenterY: number,
  amplitude: number,
  cycles:    number,
): number {
  const t = (x - barX1) / barWidth;
  return barCenterY + amplitude * Math.sin(t * cycles * Math.PI * 2);
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function generateNowPlayingCanvas(
  opts: NowPlayingCanvasOptions,
): Promise<Buffer> {
  const W = 900, H = 280;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Load cover image ───────────────────────────────────────────────────────
  let cover: any = null;
  if (opts.thumbnailUrl) {
    cover = await loadImage(opts.thumbnailUrl).catch((): null => null);
  }

  // ── 1. Full-canvas background ─────────────────────────────────────────────
  if (cover) {
    const scale = Math.max(W / cover.width, H / cover.height);
    const dw    = cover.width  * scale;
    const dh    = cover.height * scale;
    const dx    = (W - dw) / 2;
    const dy    = (H - dh) / 2;

    ctx.save();
    ctx.filter = 'blur(14px) brightness(0.30)';
    ctx.drawImage(cover, dx, dy, dw, dh);
    ctx.filter = 'none';
    ctx.restore();
  } else {
    // Dark gradient fallback
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0,   '#0a0a14');
    bg.addColorStop(0.5, '#101022');
    bg.addColorStop(1,   '#0a0a14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // Darken overlay for readability
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.fillRect(0, 0, W, H);

  // Vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Subtle left-side bloom (behind cover art)
  const leftGlow = ctx.createRadialGradient(128, 140, 0, 128, 140, 200);
  leftGlow.addColorStop(0, 'rgba(255,255,255,0.06)');
  leftGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = leftGlow;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Coloured album-art thumbnail (left) ─────────────────────────────────
  const ART_X = 28, ART_Y = 40, ART_SZ = 200, ART_R = 16;

  ctx.save();
  roundRectPath(ctx, ART_X, ART_Y, ART_SZ, ART_SZ, ART_R);

  if (cover) {
    ctx.clip();
    const s  = Math.max(ART_SZ / cover.width, ART_SZ / cover.height);
    const dw = cover.width  * s;
    const dh = cover.height * s;
    const dx = ART_X + (ART_SZ - dw) / 2;
    const dy = ART_Y + (ART_SZ - dh) / 2;
    ctx.drawImage(cover, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = '#1c1c30';
    ctx.fill();
  }
  ctx.restore();

  // Art border / glow
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.22)';
  ctx.shadowBlur  = 18;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth   = 1.5;
  roundRectPath(ctx, ART_X, ART_Y, ART_SZ, ART_SZ, ART_R);
  ctx.stroke();
  ctx.restore();

  // Placeholder note when no cover
  if (!cover) {
    ctx.save();
    ctx.font         = '72px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'rgba(255,255,255,0.18)';
    ctx.fillText('♪', ART_X + ART_SZ / 2, ART_Y + ART_SZ / 2);
    ctx.restore();
  }

  // ── 3. Text panel (right of cover art) ────────────────────────────────────
  const PX    = ART_X + ART_SZ + 30;  // 258
  const PX2   = W - 24;               // 876  (right edge)
  const PW    = PX2 - PX;             // ~618

  const MUTED  = 'rgba(255,255,255,0.52)';
  const BRIGHT = 'rgba(255,255,255,0.96)';

  // "NOW PLAYING" label
  ctx.save();
  ctx.font         = '500 10px sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = 'rgba(255,255,255,0.38)';
  ctx.fillText('NOW PLAYING', PX, 46);
  ctx.restore();

  // Song title
  ctx.save();
  ctx.font         = 'bold 25px sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = BRIGHT;
  ctx.shadowColor  = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur   = 10;
  ctx.fillText(truncate(opts.title, 38), PX, 64);
  ctx.restore();

  // Artist
  ctx.save();
  ctx.font         = '15px sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = MUTED;
  ctx.fillText(truncate(opts.artist, 52), PX, 98);
  ctx.restore();

  // ── 4. Wavy seek bar ──────────────────────────────────────────────────────
  const BAR_X1   = PX;
  const BAR_X2   = PX2;
  const BAR_W    = BAR_X2 - BAR_X1;
  const BAR_CY   = 148;   // vertical centre of the wave
  const AMP      = 4.5;   // wave amplitude in px
  const CYCLES   = 4;     // full sine cycles across the full bar width
  const STEP     = 1;     // x-step for path drawing (px)

  const progress  = Math.min(1, Math.max(0, opts.progress / 100));
  const progX     = BAR_X1 + BAR_W * progress;
  const progY     = waveY(progX, BAR_X1, BAR_W, BAR_CY, AMP, CYCLES);

  // Unfilled portion — full wave, very dim
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(BAR_X1, waveY(BAR_X1, BAR_X1, BAR_W, BAR_CY, AMP, CYCLES));
  for (let x = BAR_X1 + STEP; x <= BAR_X2; x += STEP) {
    ctx.lineTo(x, waveY(x, BAR_X1, BAR_W, BAR_CY, AMP, CYCLES));
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';
  ctx.stroke();
  ctx.restore();

  // Filled portion — up to progress, bright gradient
  if (progress > 0.005) {
    const fillGrad = ctx.createLinearGradient(BAR_X1, 0, progX, 0);
    fillGrad.addColorStop(0, 'rgba(255,255,255,0.50)');
    fillGrad.addColorStop(1, 'rgba(255,255,255,0.98)');

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(BAR_X1, waveY(BAR_X1, BAR_X1, BAR_W, BAR_CY, AMP, CYCLES));
    for (let x = BAR_X1 + STEP; x <= progX; x += STEP) {
      ctx.lineTo(x, waveY(x, BAR_X1, BAR_W, BAR_CY, AMP, CYCLES));
    }
    ctx.strokeStyle = fillGrad;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // Playhead dot
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.90)';
  ctx.shadowBlur  = 12;
  ctx.fillStyle   = '#ffffff';
  ctx.beginPath();
  ctx.arc(progX, progY, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── 5. Time labels ────────────────────────────────────────────────────────
  const TIME_Y = BAR_CY + 16;

  ctx.save();
  ctx.font         = '11px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = MUTED;
  ctx.textAlign    = 'left';
  ctx.fillText(opts.currentFormatted, BAR_X1, TIME_Y);
  ctx.textAlign    = 'right';
  ctx.fillText(opts.isLive ? 'LIVE' : opts.durationFormatted, BAR_X2, TIME_Y);
  ctx.restore();

  // ── 6. Volume + Requester ─────────────────────────────────────────────────
  const INFO_Y = TIME_Y + 22;

  ctx.save();
  ctx.font         = '12px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = MUTED;

  ctx.textAlign = 'left';
  ctx.fillText(`Volume  ${opts.volume}%`, PX, INFO_Y);

  if (opts.requestedBy) {
    ctx.textAlign = 'right';
    ctx.fillText(`Requested by  ${opts.requestedBy}`, PX2, INFO_Y);
  }
  ctx.restore();

  // ── 7. Thin separator ─────────────────────────────────────────────────────
  const SEP_Y = H - 34;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(ART_X, SEP_Y);
  ctx.lineTo(W - ART_X, SEP_Y);
  ctx.stroke();
  ctx.restore();

  // ── 8. "Powered by {botName}" ─────────────────────────────────────────────
  ctx.save();
  ctx.font         = '11px sans-serif';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle    = 'rgba(255,255,255,0.24)';
  ctx.fillText(`Powered by ${botName}`, W - 24, H - 10);
  ctx.restore();

  return canvas.toBuffer('image/png');
}
