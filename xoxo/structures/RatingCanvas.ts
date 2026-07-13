// xoxo/structures/RatingCanvas.ts
//
// Unified canvas generator for ALL 4 rating commands:
//   $howcute   (pink)  |  $gay      (rainbow)
//   $intelligent (blue)|  $autistic (teal)
//
// Same file. One shared function. 600×200.
// Each command gets a distinct aesthetic via its own theme + slightly different
// decorative shapes so they don't look like clones.
//
// Key visual differences per theme:
//   • Pink  – scattered small hearts, star sparkle, dreamy warm tones
//   • Rainbow – angled prism stripe overlay, brighter saturation
//   • Blue  – corner constellation dots, cool star, clinical crisp feel
//   • Teal  – dashed line accent, circular ripple, calm earthy tones

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

// ── Font loading ───────────────────────────────────────────────────────────────
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts'); } catch { /* ignore */ }
try { GlobalFonts.loadFontsFromDir('/usr/share/fonts/truetype'); } catch { /* ignore */ }

// ── Theme types ───────────────────────────────────────────────────────────────

export interface RatingTierTheme {
  ring:         string;
  shadow:       string;
  gradientFrom: string;
  gradientTo:   string;
  captionColor: string;
  bloom:        string; // rgba()
  particle:     string; // colour for small decorative shapes
}

export interface RatingTheme {
  normal:    RatingTierTheme;
  rare:      RatingTierTheme;
  infinite:  RatingTierTheme;
  bgFrom:    string;
  bgMid:     string;
  bgTo:      string;
  bokeh:     string;
  // Each command gets a unique shape set so images don't look identical
  decoStyle: 'pinkHearts' | 'prismStripe' | 'cornerStars' | 'tealDashes';
}

// ── Preset themes ─────────────────────────────────────────────────────────────

export const pinkTheme: RatingTheme = {
  normal: {
    ring: '#e88da8', shadow: '#ffaed2',
    gradientFrom: '#ffb6c1', gradientTo: '#ff69b4',
    captionColor: '#f8bbd0',
    bloom: 'rgba(255,174,210,0.22)',
    particle: '#ff91a4',
  },
  rare: {
    ring: '#d97706', shadow: '#fbbf24',
    gradientFrom: '#fde68a', gradientTo: '#f59e0b',
    captionColor: '#fcd34d',
    bloom: 'rgba(251,191,36,0.20)',
    particle: '#fbbf24',
  },
  infinite: {
    ring: '#fbbf24', shadow: '#fff176',
    gradientFrom: '#fff9c4', gradientTo: '#ffd54f',
    captionColor: '#fff59d',
    bloom: 'rgba(255,241,118,0.22)',
    particle: '#fff176',
  },
  bgFrom: '#2b0a1a', bgMid: '#3d1226', bgTo: '#2b0a1a',
  bokeh: 'rgba(255,182,193,0.30)',
  decoStyle: 'pinkHearts',
};

export const blueTheme: RatingTheme = {
  normal: {
    ring: '#4dabf7', shadow: '#74c0fc',
    gradientFrom: '#a5d8ff', gradientTo: '#4dabf7',
    captionColor: '#b2ebf2',
    bloom: 'rgba(77,171,247,0.20)',
    particle: '#74c0fc',
  },
  rare: {
    ring: '#00b4d8', shadow: '#90e0ef',
    gradientFrom: '#caf0f8', gradientTo: '#00b4d8',
    captionColor: '#caf0f8',
    bloom: 'rgba(0,180,216,0.20)',
    particle: '#90e0ef',
  },
  infinite: {
    ring: '#4895ef', shadow: '#90e0ef',
    gradientFrom: '#e0f7fa', gradientTo: '#4cc9f0',
    captionColor: '#e0f7fa',
    bloom: 'rgba(76,201,240,0.22)',
    particle: '#90e0ef',
  },
  bgFrom: '#0a0e2b', bgMid: '#0f153d', bgTo: '#0a0e2b',
  bokeh: 'rgba(165,216,255,0.28)',
  decoStyle: 'cornerStars',
};

export const rainbowTheme: RatingTheme = {
  normal: {
    ring: '#b983ff', shadow: '#e0aaff',
    gradientFrom: '#f0abfc', gradientTo: '#c77dff',
    captionColor: '#e0aaff',
    bloom: 'rgba(176,131,255,0.20)',
    particle: '#e0aaff',
  },
  rare: {
    ring: '#ff6d00', shadow: '#ff9e00',
    gradientFrom: '#ffea00', gradientTo: '#ff6d00',
    captionColor: '#ffea00',
    bloom: 'rgba(255,109,0,0.20)',
    particle: '#ff9e00',
  },
  infinite: {
    ring: '#ff00ff', shadow: '#ff5dff',
    gradientFrom: '#ffccff', gradientTo: '#ff5dff',
    captionColor: '#ffccff',
    bloom: 'rgba(255,93,255,0.22)',
    particle: '#ff5dff',
  },
  bgFrom: '#1a0a2b', bgMid: '#241040', bgTo: '#1a0a2b',
  bokeh: 'rgba(224,170,255,0.28)',
  decoStyle: 'prismStripe',
};

export const tealTheme: RatingTheme = {
  normal: {
    ring: '#4ecdc4', shadow: '#7ee8d9',
    gradientFrom: '#a8f0e0', gradientTo: '#4ecdc4',
    captionColor: '#b5ead7',
    bloom: 'rgba(78,205,196,0.20)',
    particle: '#7ee8d9',
  },
  rare: {
    ring: '#ffd93d', shadow: '#fff176',
    gradientFrom: '#fff9c4', gradientTo: '#ffd93d',
    captionColor: '#fff59d',
    bloom: 'rgba(255,217,61,0.20)',
    particle: '#fff176',
  },
  infinite: {
    ring: '#00e5ff', shadow: '#84ffff',
    gradientFrom: '#e0f7fa', gradientTo: '#18ffff',
    captionColor: '#e0f7fa',
    bloom: 'rgba(132,255,255,0.22)',
    particle: '#84ffff',
  },
  bgFrom: '#051e1e', bgMid: '#082b2a', bgTo: '#051e1e',
  bokeh: 'rgba(168,240,224,0.28)',
  decoStyle: 'tealDashes',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickTier(theme: RatingTheme, isInfinite: boolean, isRare: boolean) {
  return isInfinite ? theme.infinite : isRare ? theme.rare : theme.normal;
}

function bokehDot(ctx: any, x: number, y: number, r: number, color: string, glow: string, blur: number) {
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur  = blur;
  ctx.fillStyle   = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function smallHeart(ctx: any, cx: number, cy: number, size: number, color: string, shadow: string) {
  ctx.save();
  ctx.shadowColor = shadow;
  ctx.shadowBlur  = 4;
  ctx.fillStyle   = color;
  ctx.beginPath();
  const topY = cy - size * 0.25;
  const botY = cy + size * 0.40;
  const leftX = cx - size * 0.50;
  const rightX = cx + size * 0.50;
  ctx.moveTo(cx, botY);
  ctx.bezierCurveTo(leftX, cy, leftX, topY, cx - size * 0.12, topY);
  ctx.bezierCurveTo(cx + size * 0.12, topY, rightX, cy, cx, botY);
  ctx.fill();
  ctx.restore();
}

function fourPointStar(ctx: any, cx: number, cy: number, outer: number, inner: number, color: string, shadow: string) {
  ctx.save();
  ctx.shadowColor = shadow;
  ctx.shadowBlur  = 6;
  ctx.fillStyle   = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 - Math.PI / 2;
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + Math.cos(a + 0.2) * inner, cy + Math.sin(a + 0.2) * inner, cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.quadraticCurveTo(cx + Math.cos(a - 0.2) * inner, cy + Math.sin(a - 0.2) * inner, cx, cy);
  }
  ctx.fill();
  ctx.restore();
}

// ── Theme-specific decorations ───────────────────────────────────────────────────

function drawPinkHearts(ctx: any, tier: RatingTierTheme, W: number, H: number) {
  // Scattered tiny hearts
  smallHeart(ctx, 520, 32,  8, tier.particle, tier.shadow);
  smallHeart(ctx, 50,  160, 6, tier.particle, tier.shadow);
  smallHeart(ctx, 560, 155, 5, tier.particle, tier.shadow);
  smallHeart(ctx, 300, 22,  4, tier.particle, tier.shadow);
  // Sparkle
  fourPointStar(ctx, 500, 160, 10, 4, tier.gradientTo, tier.shadow);
}

function drawPrismStripe(ctx: any, tier: RatingTierTheme, W: number, H: number) {
  // Diagonal translucent stripe across right side
  ctx.save();
  ctx.globalAlpha = 0.06;
  const grad = ctx.createLinearGradient(380, 0, 580, H);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.5, tier.gradientFrom);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(420, 0);
  ctx.lineTo(520, 0);
  ctx.lineTo(600, H);
  ctx.lineTo(500, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // A few bright sparkles
  fourPointStar(ctx, 520, 40,  12, 5, tier.particle, tier.shadow);
  fourPointStar(ctx, 565, 165, 8,  3, tier.particle, tier.shadow);
}

function drawCornerStars(ctx: any, tier: RatingTierTheme, W: number, H: number) {
  // Constellation dots in corners
  const dots = [
    [28, 22], [44, 14], [22, 38],
    [572, 18], [584, 30], [560, 28],
    [28, 178], [42, 186], [14, 170],
    [574, 178], [586, 170], [560, 186],
  ];
  for (const [x, y] of dots) {
    bokehDot(ctx, x, y, 1.2, tier.particle, tier.shadow, 3);
  }
  // One 4-point star
  fourPointStar(ctx, 300, 14, 10, 4, tier.gradientFrom, tier.shadow);
}

function drawTealDashes(ctx: any, tier: RatingTierTheme, W: number, H: number) {
  // Small dashed arc near the avatar right edge
  ctx.save();
  ctx.strokeStyle = tier.particle;
  ctx.lineWidth   = 1.5;
  ctx.globalAlpha = 0.35;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.arc(118, H / 2, 78, -Math.PI / 3, Math.PI / 3);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // Ripple ring (very faint)
  ctx.save();
  ctx.strokeStyle = tier.bloom.replace(/[\d.]+%?\)/, '0.12)');
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.arc(118, H / 2, 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface RatingCanvasOptions {
  avatarURLs:  string[];
  displayName: string;
  pct:         number;
  caption:     string;
  theme:       RatingTheme;
}

export async function generateRatingCanvas(opts: RatingCanvasOptions): Promise<Buffer> {
  const { avatarURLs, displayName, pct, caption, theme } = opts;

  const W = 600, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const isInfinite = !isFinite(pct);
  const isRare     = isFinite(pct) && pct > 100;
  const tier       = pickTier(theme, isInfinite, isRare);

  // ── 1. Background ─────────────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   theme.bgFrom);
  bg.addColorStop(0.5, theme.bgMid);
  bg.addColorStop(1,   theme.bgTo);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Soft aurora behind avatar ───────────────────────────────────────────────────────
  const avX = 118, avY = H / 2;
  const bloom = ctx.createRadialGradient(avX, avY, 0, avX, avY, 190);
  bloom.addColorStop(0,    tier.bloom);
  bloom.addColorStop(0.50, tier.bloom.replace(/[\d.]+%?\)/, '0.06)'));
  bloom.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, W, H);

  // ── 3. Accent glow on right side ───────────────────────────────────────────────────────
  const rBloom = ctx.createRadialGradient(W - 70, H / 2, 0, W - 70, H / 2, 110);
  rBloom.addColorStop(0, tier.bloom.replace(/[\d.]+%?\)/, '0.10)'));
  rBloom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rBloom;
  ctx.fillRect(0, 0, W, H);

  // ── 4. Vignette ──────────────────────────────────────────────────────────────────────────
  const vig = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 1.0);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // ── 5. Bokeh dots ──────────────────────────────────────────────────────────────────────────
  const bokehPts = [
    { x: 24,  y: 20,  r: 1.8, blur: 5 },
    { x: 576, y: 24,  r: 1.6, blur: 5 },
    { x: 570, y: 172, r: 2.0, blur: 6 },
    { x: 20,  y: 176, r: 1.5, blur: 4 },
    { x: 296, y: 16,  r: 1.8, blur: 5 },
    { x: 304, y: 182, r: 1.6, blur: 5 },
    { x: 478, y: 32,  r: 1.4, blur: 4 },
    { x: 470, y: 166, r: 1.4, blur: 4 },
    { x: 54,  y: 164, r: 1.2, blur: 3 },
  ];
  for (const p of bokehPts) {
    bokehDot(ctx, p.x, p.y, p.r, theme.bokeh, tier.shadow, p.blur);
  }

  // ── 6. Theme-specific decorations (make each image look DIFFERENT) ───────────────────────
  switch (theme.decoStyle) {
    case 'pinkHearts':     drawPinkHearts(ctx, tier, W, H);     break;
    case 'prismStripe':    drawPrismStripe(ctx, tier, W, H);    break;
    case 'cornerStars':    drawCornerStars(ctx, tier, W, H);    break;
    case 'tealDashes':     drawTealDashes(ctx, tier, W, H);     break;
  }

  // ── 7. Avatar ──────────────────────────────────────────────────────────────────────
  const avR = 70;

  let img: any = null;
  for (const url of avatarURLs) {
    if (!url) continue;
    img = await loadImage(url).catch((): null => null);
    if (img) break;
  }

  // Outer ring (glow)
  ctx.save();
  ctx.shadowColor = tier.shadow;
  ctx.shadowBlur  = isInfinite ? 26 : isRare ? 20 : 14;
  ctx.strokeStyle = tier.ring;
  ctx.lineWidth   = 2.2;
  ctx.beginPath();
  ctx.arc(avX, avY, avR + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Inner faint ring
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = 0.6;
  ctx.beginPath();
  ctx.arc(avX, avY, avR + 2.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Avatar image
  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  if (!img) {
    ctx.fillStyle = '#111122';
    ctx.fill();
  } else {
    ctx.clip();
    ctx.drawImage(img, avX - avR, avY - avR, avR * 2, avR * 2);
  }
  ctx.restore();

  // ── 8. Vertical separator ─────────────────────────────────────────────────────────────────────────
  const sepX = 220;
  const sepGrad = ctx.createLinearGradient(sepX, 0, sepX, H);
  sepGrad.addColorStop(0,   'rgba(255,255,255,0)');
  sepGrad.addColorStop(0.3, 'rgba(255,255,255,0.14)');
  sepGrad.addColorStop(0.7, 'rgba(255,255,255,0.14)');
  sepGrad.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.save();
  ctx.strokeStyle = sepGrad;
  ctx.lineWidth   = 0.8;
  ctx.beginPath();
  ctx.moveTo(sepX, 0);
  ctx.lineTo(sepX, H);
  ctx.stroke();
  ctx.restore();

  // ── 9. Right panel text ──────────────────────────────────────────────────────────────
  const panelCX = sepX + (W - sepX) / 2;

  // Name
  const nameLabel = (displayName ?? '?').slice(0, 22);
  ctx.save();
  ctx.font         = '600 13px sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = 'rgba(240,240,250,0.82)';
  ctx.fillText(nameLabel, panelCX, 26);
  ctx.restore();

  // Accent underline
  const lineW = Math.min(ctx.measureText(nameLabel).width + 24, 150);
  const lx1 = panelCX - lineW / 2;
  const lx2 = panelCX + lineW / 2;
  const ly  = 46;
  const lg  = ctx.createLinearGradient(lx1, ly, lx2, ly);
  lg.addColorStop(0,   'rgba(0,0,0,0)');
  lg.addColorStop(0.3, tier.gradientFrom + 'dd');
  lg.addColorStop(0.7, tier.gradientTo   + 'dd');
  lg.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.save();
  ctx.strokeStyle = lg;
  ctx.lineWidth   = 1.0;
  ctx.beginPath();
  ctx.moveTo(lx1, ly);
  ctx.lineTo(lx2, ly);
  ctx.stroke();
  ctx.restore();

  // Percentage
  const pctText   = isInfinite ? '\u221e%' : `${pct}%`;
  const pctFontSz = pctText.length > 5 ? 48 : pctText.length > 3 ? 56 : 64;

  ctx.save();
  ctx.font         = `bold ${pctFontSz}px sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = tier.shadow;
  ctx.shadowBlur   = isInfinite ? 24 : isRare ? 20 : 16;
  const pg = ctx.createLinearGradient(panelCX - 60, 0, panelCX + 60, 0);
  pg.addColorStop(0, tier.gradientFrom);
  pg.addColorStop(1, tier.gradientTo);
  ctx.fillStyle = pg;
  ctx.fillText(pctText, panelCX, 118);
  ctx.restore();

  // Caption
  ctx.save();
  ctx.font         = '11px sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle    = tier.captionColor;
  ctx.globalAlpha  = 0.82;
  ctx.fillText(caption.slice(0, 60), panelCX, H - 14);
  ctx.restore();

  return canvas.toBuffer('image/png');
}
