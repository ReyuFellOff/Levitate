// xoxo/components/fun/wanted.ts
//
// CV2 payload builder + canvas image generator for the $wanted command.
// Extreme Wild West "WANTED" poster — aged parchment, freckles, paper creases,
// subtle torn transparent edges, and a crime-tiered random bounty.

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
import { emojis } from '../../emojis.js';
import { DEV_ID } from '../../helpers/ratingBias.js';

try { GlobalFonts.loadFontsFromDir('/usr/share/fonts'); } catch { /* ignore */ }
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts/truetype'); } catch { /* ignore */ }

// Register the vintage western font for "Dead or Alive" and the crime line.
// The font lives in dior/fonts/ (source) → dist is 4 levels up from the
// compiled file, so we step back to the project root then into dior/fonts/.
try {
  const fontBuf = readFileSync(
    new URL('../../../../dior/fonts/JimNightshade-Regular.ttf', import.meta.url),
  );
  GlobalFonts.register(fontBuf, 'JimNightshade');
} catch { /* font missing at runtime — falls back to serif */ }

// ── Crime tiers (each tier has a bounty range) ────────────────────────────────
const CRIME_TIERS: { crime: string; min: number; max: number }[] = [
  // Minor
  { crime: 'Cheating at Cards',        min:    500, max:   2_500 },
  { crime: 'Saloon Brawling',           min:    800, max:   3_500 },
  { crime: 'Duel Dodging',             min:    300, max:   2_000 },
  { crime: 'Public Drunkenness',        min:    200, max:   1_500 },
  { crime: 'Chili Pepper Smuggling',   min:  1_500, max:   8_000 },
  { crime: 'Tequila Smuggling',         min:  2_000, max:  10_000 },
  // Medium
  { crime: 'Cattle Rustling',          min:  5_000, max:  20_000 },
  { crime: 'Horse Thievery',           min:  4_000, max:  18_000 },
  { crime: 'Border Skirmishes',        min:  6_000, max:  25_000 },
  { crime: 'Impersonating a Sheriff',  min:  8_000, max:  30_000 },
  // Major
  { crime: 'Bank Robbery',             min: 20_000, max: 100_000 },
  { crime: 'Train Robbery',            min: 25_000, max: 120_000 },
  { crime: 'Gold Heist',               min: 30_000, max: 150_000 },
  { crime: 'Stagecoach Hijacking',     min: 15_000, max:  60_000 },
];

// The developer always gets the highest-order crime and maximum bounty —
// no random roll, locked to these values regardless of what CRIME_TIERS says.
const DEV_CRIME  = 'Sovereign Betrayal & High Treasonery';
const DEV_BOUNTY = 1_000_000;

function rollCrimeAndBounty(userId: string): { crime: string; bounty: number } {
  if (userId === DEV_ID) return { crime: DEV_CRIME, bounty: DEV_BOUNTY };
  const tier = CRIME_TIERS[Math.floor(Math.random() * CRIME_TIERS.length)];
  const bounty = Math.floor(tier.min + Math.random() * (tier.max - tier.min));
  return { crime: tier.crime, bounty };
}

// ── Torn-edge path helper ─────────────────────────────────────────────────────
function buildTornPath(
  W: number, H: number,
  margin: number,
  toothCount: number,
  toothDepth: number,
  rng: () => number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];

  function jag(base: number, axis: 'x' | 'y', ortho: number, steps: number): void {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const along = base * t;
      const wobble = (rng() - 0.5) * toothDepth * 2;
      if (axis === 'x') pts.push({ x: along, y: ortho + wobble });
      else               pts.push({ x: ortho + wobble, y: along });
    }
  }

  jag(W, 'x', margin, toothCount);
  jag(H, 'y', W - margin, toothCount);
  for (let i = toothCount; i >= 0; i--) {
    const t = i / toothCount;
    pts.push({ x: W * t, y: H - margin + (rng() - 0.5) * toothDepth * 2 });
  }
  for (let i = toothCount; i >= 0; i--) {
    const t = i / toothCount;
    pts.push({ x: margin + (rng() - 0.5) * toothDepth * 2, y: H * t });
  }
  return pts;
}

function makePrng(seed: number) {
  let s = seed;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return ((s >>> 0) / 0xffffffff);
  };
}

// ── Main image generator ──────────────────────────────────────────────────────
async function generateWantedImage(
  user: any,
  userId: string,
  crime: string,
  bounty: number,
): Promise<Buffer> {
  // Canvas is taller (760) to give the bottom section proper breathing room.
  const W = 520, H = 760;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, W, H);

  // ── 1. Subtle torn-edge clip (fewer, shallower teeth) ──────────────────────
  const rng = makePrng(0xdeadbeef);
  // Was toothCount=40 depth=7 — reduced to 20 / 4 for a calmer tear.
  const tornPts = buildTornPath(W, H, 14, 20, 4, rng);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tornPts[0].x, tornPts[0].y);
  for (const p of tornPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.clip();

  // ── 2. Aged parchment background ───────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0,    '#f0deb4');
  bg.addColorStop(0.25, '#e8cf98');
  bg.addColorStop(0.5,  '#dfc080');
  bg.addColorStop(0.75, '#d4ad65');
  bg.addColorStop(1,    '#c49a50');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const sideLight = ctx.createLinearGradient(0, 0, W, 0);
  sideLight.addColorStop(0,   'rgba(255,245,200,0.30)');
  sideLight.addColorStop(0.5, 'rgba(255,245,200,0.00)');
  sideLight.addColorStop(1,   'rgba(60,30,10,0.20)');
  ctx.fillStyle = sideLight;
  ctx.fillRect(0, 0, W, H);

  // ── 3. Paper grain / speckling ─────────────────────────────────────────────
  const grainRng = makePrng(0xbeefdead);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(70,40,10,${0.015 + grainRng() * 0.055})`;
    ctx.beginPath();
    ctx.arc(grainRng() * W, grainRng() * H, grainRng() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(80,45,10,${0.04 + grainRng() * 0.07})`;
    ctx.beginPath();
    ctx.arc(grainRng() * W, grainRng() * H, 3 + grainRng() * 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── 4. Paper creases ───────────────────────────────────────────────────────
  const creases: [number, number, number, number, number][] = [
    [0,        H * 0.38, W,        H * 0.40, 0.18],
    [0,        H * 0.61, W,        H * 0.59, 0.13],
    [W * 0.48, 0,        W * 0.52, H,        0.12],
    [0,        H * 0.15, W * 0.6,  H * 0.18, 0.10],
    [W * 0.3,  H * 0.8,  W,        H * 0.76, 0.09],
  ];
  for (const [x1, y1, x2, y2, alpha] of creases) {
    const cg = ctx.createLinearGradient(x1, y1, x2, y2);
    cg.addColorStop(0,    `rgba(255,240,190,0)`);
    cg.addColorStop(0.35, `rgba(255,240,190,${alpha})`);
    cg.addColorStop(0.5,  `rgba(80,50,15,${alpha * 1.6})`);
    cg.addColorStop(0.65, `rgba(255,240,190,${alpha})`);
    cg.addColorStop(1,    `rgba(255,240,190,0)`);
    ctx.save();
    ctx.strokeStyle = cg;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  // ── 5. Vignette ────────────────────────────────────────────────────────────
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.82);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(50,22,5,0.68)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // ── 6. Ornate triple border ────────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = '#3e2208'; ctx.lineWidth = 7;
  ctx.strokeRect(22, 22, W - 44, H - 44);
  ctx.strokeStyle = '#7a4d1a'; ctx.lineWidth = 1.5;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.strokeStyle = '#3e2208'; ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.restore();

  const corners: [number, number][] = [
    [36, 36], [W - 36, 36], [36, H - 36], [W - 36, H - 36],
  ];
  for (const [cx, cy] of corners) {
    ctx.save();
    ctx.fillStyle = '#3e2208';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 13); ctx.lineTo(cx + 13, cy);
    ctx.lineTo(cx, cy + 13); ctx.lineTo(cx - 13, cy);
    ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 7, cy);
    ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 7, cy);
    ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#3e2208';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── 7. "WANTED" header ────────────────────────────────────────────────────
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(30,10,0,0.5)';
  ctx.font = 'bold 66px "Times New Roman", serif';
  ctx.fillText('WANTED', W / 2 + 3, 113);
  ctx.fillStyle = '#1e0e00';
  ctx.fillText('WANTED', W / 2, 110);
  ctx.font = 'bold 36px "JimNightshade", "Times New Roman", serif';
  ctx.fillStyle = '#3e2208';
  ctx.fillText('\u2015 Dead or Alive \u2015', W / 2, 146);
  ctx.restore();

  // Decorative rule — moved down 8px from before to give avatar more clearance.
  ctx.save();
  ctx.strokeStyle = '#3e2208';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(60, 156); ctx.lineTo(W - 60, 156); ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(60, 161); ctx.lineTo(W - 60, 161); ctx.stroke();
  ctx.restore();

  // ── 8. Avatar ─────────────────────────────────────────────────────────────
  // avY bumped to 192 (+14 vs before) so there's a clear 31px gap from the
  // decorative rule (161) to the frame outer edge (192 - 8 = 184).
  const avSize = 258;
  const avX = (W - avSize) / 2;
  const avY = 192;

  // Lighter single-layer brownish frame (was 3 heavy layers of near-black brown).
  // Outer border fills to avX-8/avY-8, inner lip at avX-3/avY-3.
  ctx.save();
  // Drop shadow
  ctx.shadowColor = 'rgba(30,10,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#7a4d20';
  ctx.fillRect(avX - 8, avY - 8, avSize + 16, avSize + 16);
  ctx.shadowBlur = 0;
  // Warm mid-brown inner lip
  ctx.fillStyle = '#9b6530';
  ctx.fillRect(avX - 5, avY - 5, avSize + 10, avSize + 10);
  // Thin dark inner edge
  ctx.fillStyle = '#4a2a0c';
  ctx.fillRect(avX - 2, avY - 2, avSize + 4, avSize + 4);
  ctx.restore();

  // Nail-head rivets at the four corners
  const rivetCorners: [number, number][] = [
    [avX - 6, avY - 6], [avX + avSize + 6, avY - 6],
    [avX - 6, avY + avSize + 6], [avX + avSize + 6, avY + avSize + 6],
  ];
  for (const [rx, ry] of rivetCorners) {
    ctx.save();
    const rg = ctx.createRadialGradient(rx - 1, ry - 1, 0, rx, ry, 4);
    rg.addColorStop(0, '#d4a860'); rg.addColorStop(0.5, '#8a5828'); rg.addColorStop(1, '#3e2208');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(rx, ry, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Load + draw avatar with sepia tint
  const img = await loadImage(
    user.displayAvatarURL({ forceStatic: true, size: 256, extension: 'png' }),
  ).catch((): null => null);

  ctx.save();
  ctx.beginPath(); ctx.rect(avX, avY, avSize, avSize); ctx.clip();
  if (img) {
    ctx.drawImage(img, avX, avY, avSize, avSize);
    // Sepia multiply — slightly lighter than before (#b8842e → #c09040)
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#c09040';
    ctx.fillRect(avX, avY, avSize, avSize);
    ctx.globalCompositeOperation = 'source-over';
    // Reduced darkening overlay (was 0.15 → 0.08)
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#2a1400';
    ctx.fillRect(avX, avY, avSize, avSize);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = '#8a6d3a';
    ctx.fillRect(avX, avY, avSize, avSize);
  }
  ctx.restore();

  // ── 9. Freckles over avatar ────────────────────────────────────────────────
  const freckleRng = makePrng(0xcafebabe);
  for (let i = 0; i < 38; i++) {
    const fx = avX + 30 + freckleRng() * (avSize - 60);
    const fy = avY + 20 + freckleRng() * (avSize - 40);
    const fr = 1.0 + freckleRng() * 2.2;
    const fa = 0.10 + freckleRng() * 0.22;
    ctx.save();
    ctx.globalAlpha = fa;
    ctx.fillStyle = `rgb(${80 + Math.floor(freckleRng() * 30)},${40 + Math.floor(freckleRng() * 20)},10)`;
    ctx.beginPath();
    ctx.ellipse(fx, fy, fr, fr * (0.6 + freckleRng() * 0.5), freckleRng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── 10–13. Text block below avatar ───────────────────────────────────────
  // All offsets measured from avBot = avY + avSize so the block scales with
  // avatar position rather than being hardcoded to specific absolute y values.
  const avBot = avY + avSize; // = 450

  // Name  (avBot + 50 = 500)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(30,10,0,0.35)';
  ctx.font = 'bold 30px "Times New Roman", serif';
  ctx.fillText(`"${(user.globalName ?? user.username ?? '?').slice(0, 22).toUpperCase()}"`, W / 2 + 2, avBot + 52);
  ctx.fillStyle = '#200e00';
  ctx.fillText(`"${(user.globalName ?? user.username ?? '?').slice(0, 22).toUpperCase()}"`, W / 2, avBot + 50);
  ctx.restore();

  // Thin rule  (avBot + 70 = 520)
  ctx.save();
  ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(70, avBot + 70); ctx.lineTo(W - 70, avBot + 70); ctx.stroke();
  ctx.restore();

  // "Wanted for:" label  (avBot + 92 = 542)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5a3210';
  ctx.font = 'italic 17px "Times New Roman", serif';
  ctx.fillText('Wanted for:', W / 2, avBot + 92);

  // Crime name  (avBot + 120 = 570)
  ctx.fillStyle = '#2a1000';
  ctx.font = 'bold 32px "JimNightshade", "Times New Roman", serif';
  ctx.fillText(crime, W / 2, avBot + 120);
  ctx.restore();

  // Bounty amount  (avBot + 182 = 632)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(30,5,0,0.45)';
  ctx.font = 'bold 50px "Times New Roman", serif';
  ctx.fillText(`$${bounty.toLocaleString('en-US')}`, W / 2 + 3, avBot + 185);
  ctx.fillStyle = '#8a1f08';
  ctx.fillText(`$${bounty.toLocaleString('en-US')}`, W / 2, avBot + 182);

  // REWARD label  (avBot + 210 = 660)
  ctx.font = 'bold 15px "Times New Roman", serif';
  ctx.fillStyle = '#3e2208';
  ctx.letterSpacing = '3px';
  ctx.fillText('R E W A R D', W / 2, avBot + 210);
  ctx.restore();

  // Sheriff stamp  (H - 46 = 714 — well below REWARD and above inner border at H-36=724)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.28;
  ctx.font = 'bold 10px "Times New Roman", serif';
  ctx.fillStyle = '#3e2208';
  ctx.fillText('BY ORDER OF THE SHERIFF — BOUNTY HUNTERS SANCTIONED', W / 2, H - 46);
  ctx.restore();

  ctx.restore(); // end torn clip
  return canvas.toBuffer('image/png');
}

// ── Public payload builder ────────────────────────────────────────────────────
export async function buildWantedPayload(opts: { user: any; invokerUsername: string }): Promise<any> {
  const { user, invokerUsername } = opts;
  const { crime, bounty } = rollCrimeAndBounty(user.id);
  const imageBuffer = await generateWantedImage(user, user.id, crime, bounty);

  const gallery = new MediaGalleryBuilder()
    .addItems(new MediaGalleryItemBuilder().setURL('attachment://wanted.png'));

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blade ?? '🤠'} Wanted Poster`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Requested by ${invokerUsername}`),
    );

  return {
    components:      [container],
    files:           [{ attachment: imageBuffer, name: 'wanted.png' }],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
