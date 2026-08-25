// xoxo/commands/developer/steal.ts
//
// Developer-only command. Steals emojis, stickers, or an image (URL / attachment)
// and adds them to one or more of the bot's mutual servers with the developer.
//
// Usage:
//   $steal <emoji>                   — single emoji mention or animated variant
//   $steal <emoji> <emoji> ...       — multiple emojis → bulk, default names, no modal
//   $steal <emoji-id>                — numeric ID resolves emoji first, sticker second
//   $steal <emoji-name>              — name-based lookup across all bot guilds
//   $steal <sticker-name>            — same lookup order
//   $steal <sticker-id>              — numeric sticker ID
//   $steal <image-url>               — HTTPS URL → asks emoji or sticker
//   $steal (+ attachment)            — attached image → asks emoji or sticker
//
// Flow (single):
//   [1] Resolve input → emoji | sticker | image
//   [2] Preview.  Image → ask emoji/sticker type.
//   [3] Guild select + (images) crop toggle.
//       Confirm → modal for name.  Blank = original name.  Invalid → ephemeral error, retry.
//   [4] Crop if requested, add to each server, show results.
//
// Flow (bulk — 2+ emoji/sticker tokens):
//   [1] Resolve all tokens, skip unresolvable ones.
//   [2] Bulk preview (list of items, all with original names), Continue/Cancel.
//   [3] Guild select (no crop, no name modal).
//   [4] Add each item to each server, show per-guild results.

import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  buildStealPreviewPayload,
  buildStealImageTypeSelectPayload,
  buildStealGuildSelectPayload,
  buildStealNameModal,
  buildStealProgressPayload,
  buildStealResultPayload,
  buildStealBulkPreviewPayload,
  buildStealBulkResultPayload,
  buildStealCancelledPayload,
  buildStealTimedOutPayload,
  type StealAssetType,
  type StealBulkTarget,
} from '../../components/developer/steal.js';

export const options = {
  name:        'developer-steal',
  aliases:     ['devsteal'] as string[],
  description: 'Steal emoji(s), sticker(s), or an image into one or more mutual servers.',
  usage:       'steal <emoji | emoji-id | emoji-name | sticker | sticker-id | image-url>',
  category:    'developer',
  owner:       true,
  cooldown:    0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

async function resolveSticker(client: CassieClient, identifier: string): Promise<any | null> {
  const isId  = /^\d{17,20}$/.test(identifier);
  const lower = identifier.toLowerCase();

  for (const guild of client.guilds.cache.values()) {
    try {
      if (isId) {
        const s = await guild.stickers.fetch(identifier).catch((): null => null);
        if (s) return s;
      } else {
        const stickers = await guild.stickers.fetch().catch((): null => null);
        if (stickers) {
          const found = stickers.find((s: any) => s.name.toLowerCase() === lower);
          if (found) return found;
        }
      }
    } catch { /* guild inaccessible */ }
  }
  return null;
}

type ResolvedTarget =
  | { kind: 'emoji';   name: string; imageUrl: string; animated: boolean; sourceGuild: string }
  | { kind: 'sticker'; name: string; imageUrl: string; tags: string;      sourceGuild: string }
  | { kind: 'image';   url: string };

async function resolveTarget(
  input:  string,
  client: CassieClient,
  guild?: any,
): Promise<ResolvedTarget | null> {
  if (isUrl(input)) return { kind: 'image', url: input };

  const emoji = await resolveEmoji(client, input, guild);
  if (emoji) {
    const ext      = emoji.animated ? 'gif' : 'png';
    const imageUrl = emoji.imageURL?.({ size: 128, extension: ext }) ?? emoji.url;
    return {
      kind:        'emoji',
      name:        emoji.name ?? 'unknown',
      imageUrl,
      animated:    emoji.animated ?? false,
      sourceGuild: (emoji.guild as any)?.name ?? 'Unknown',
    };
  }

  const sticker = await resolveSticker(client, input);
  if (sticker) {
    return {
      kind:        'sticker',
      name:        sticker.name,
      imageUrl:    sticker.url,
      tags:        sticker.tags ?? '🎨',
      sourceGuild: sticker.guild?.name ?? 'Unknown',
    };
  }

  return null;
}

async function getMutualGuilds(
  client: CassieClient,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  const mutual: { id: string; name: string; memberCount: number }[] = [];
  for (const guild of client.guilds.cache.values()) {
    const isMember =
      guild.members.cache.has(userId) ||
      !!(await guild.members.fetch(userId).catch((): null => null));
    if (isMember)
      mutual.push({ id: guild.id, name: guild.name, memberCount: guild.memberCount ?? 0 });
  }
  return mutual
    .sort((a, b) => b.memberCount - a.memberCount)
    .map(({ id, name }) => ({ id, name }));
}

function isValidName(name: string, type: StealAssetType): boolean {
  if (type === 'emoji') return /^[a-zA-Z0-9_]{2,32}$/.test(name);
  return name.length >= 2 && name.length <= 30 && !/[\x00-\x1F\x7F]/.test(name);
}

function nameValidationError(name: string, type: StealAssetType): string {
  if (type === 'emoji') {
    if (name.length < 2)  return 'Emoji names must be at least **2** characters.';
    if (name.length > 32) return 'Emoji names must be at most **32** characters.';
    return 'Emoji names may only contain letters, numbers, and underscores (`a-z A-Z 0-9 _`).';
  }
  if (name.length < 2)  return 'Sticker names must be at least **2** characters.';
  if (name.length > 30) return 'Sticker names must be at most **30** characters.';
  return 'Sticker name contains invalid characters.';
}

async function cropToSquare(url: string): Promise<Buffer> {
  const img    = await loadImage(url);
  const size   = Math.min(img.width, img.height);
  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext('2d');
  ctx.drawImage(img as any, -(img.width - size) / 2, -(img.height - size) / 2, img.width, img.height);
  return canvas.toBuffer('image/png') as unknown as Buffer;
}

function awaitModalSubmit(
  client:    CassieClient,
  customId:  string,
  userId:    string,
  timeoutMs: number,
): Promise<any | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.removeListener('interactionCreate', handler);
      resolve(null);
    }, timeoutMs);

    function handler(interaction: any) {
      if (
        interaction.isModalSubmit?.() &&
        interaction.customId === customId &&
        interaction.user?.id === userId
      ) {
        clearTimeout(timer);
        client.removeListener('interactionCreate', handler);
        resolve(interaction);
      }
    }

    client.on('interactionCreate', handler);
  });
}

async function addEmoji(
  guild:     any,
  imageData: string | Buffer,
  name:      string,
): Promise<string | null> {
  try {
    await guild.emojis.create({ attachment: imageData, name, reason: 'steal command (developer)' });
    return null;
  } catch (e: any) {
    const msg: string = e?.message ?? String(e);
    if (msg.includes('Missing Permissions'))   return 'Missing Manage Expressions permission';
    if (msg.includes('Maximum number'))        return 'Server emoji limit reached';
    if (msg.includes('File cannot be larger')) return 'Image too large for emoji';
    return msg.split('\n')[0]?.slice(0, 80) ?? 'Unknown error';
  }
}

async function addSticker(
  guild:     any,
  imageData: string | Buffer,
  name:      string,
  tags:      string,
): Promise<string | null> {
  try {
    await guild.stickers.create({ file: imageData, name, tags, reason: 'steal command (developer)' });
    return null;
  } catch (e: any) {
    const msg: string = e?.message ?? String(e);
    if (msg.includes('Missing Permissions'))   return 'Missing Manage Expressions permission';
    if (msg.includes('Maximum number'))        return 'Server sticker limit reached';
    if (msg.includes('File cannot be larger')) return 'Image too large for sticker';
    return msg.split('\n')[0]?.slice(0, 80) ?? 'Unknown error';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guild select — shared between single and bulk flows
// Returns 'confirmed' | 'cancel' | 'timeout', mutates selectedGuildIds.
// ─────────────────────────────────────────────────────────────────────────────

async function runGuildSelect(opts: {
  panel:            any;
  token:            string;
  shownGuilds:      { id: string; name: string }[];
  truncated:        boolean;
  assetType:        StealAssetType;
  originalName:     string;
  imageUrl:         string;
  wasOriginallyImage: boolean;
  selectedGuildIds: string[];         // mutated in-place
  client:           CassieClient;
  authorId:         string;
}): Promise<{ result: 'confirmed' | 'cancel' | 'timeout'; finalName?: string; shouldCrop?: boolean }> {
  const {
    panel, token, shownGuilds, truncated,
    assetType, originalName, imageUrl,
    wasOriginallyImage, selectedGuildIds, client, authorId,
  } = opts;

  let cropClicked  = false;
  let cropChoice   = true;
  let awaitingModal = false;
  let finalName: string | undefined;

  const buildPanel = () => buildStealGuildSelectPayload({
    type: assetType, originalName, imageUrl,
    guilds: shownGuilds, token, truncated,
    isImage: wasOriginallyImage, cropClicked, cropChoice,
  });

  await panel.edit(buildPanel()).catch((): null => null);

  return new Promise((resolve) => {
    const c = panel.createMessageComponentCollector({
      filter: (i: any) => authorOnlyFilter(i, authorId, (cid) => cid.endsWith(`:${token}`)),
      time:   120_000,
    });

    c.on('collect', async (i: any) => {
      if (i.isStringSelectMenu?.() && i.customId === `steal:guilds:${token}`) {
        selectedGuildIds.splice(0, selectedGuildIds.length, ...(i.values as string[]));
        await i.deferUpdate().catch((): null => null);
        return;
      }
      if (!i.isButton?.()) return;

      if (i.customId === `steal:crop-yes:${token}`) {
        cropClicked = true; cropChoice = true;
        await i.update(buildPanel()).catch((): null => null);
        return;
      }
      if (i.customId === `steal:crop-no:${token}`) {
        cropClicked = true; cropChoice = false;
        await i.update(buildPanel()).catch((): null => null);
        return;
      }
      if (i.customId === `steal:cancel:${token}`) {
        await i.deferUpdate().catch((): null => null);
        c.stop('cancelled'); resolve({ result: 'cancel' });
        return;
      }
      if (i.customId === `steal:confirm-guilds:${token}`) {
        if (!selectedGuildIds.length) { await i.deferUpdate().catch((): null => null); return; }
        if (awaitingModal)            { await i.deferUpdate().catch((): null => null); return; }

        awaitingModal = true;
        await (i as any).showModal(buildStealNameModal(token, assetType, originalName)).catch((): null => null);

        const modalSubmit = await awaitModalSubmit(client, `steal:name-modal:${token}`, authorId, 60_000);
        awaitingModal = false;
        if (!modalSubmit) return; // timed out — leave collector running

        const rawName = (
          modalSubmit.fields?.getTextInputValue?.(`steal:name-input:${token}`) ?? ''
        ).trim();

        // Empty → keep original name
        if (rawName === '') {
          finalName = originalName;
        } else if (!isValidName(rawName, assetType)) {
          await modalSubmit.reply({
            content: `Invalid name: ${nameValidationError(rawName, assetType)}`,
            flags: 64,
          }).catch((): null => null);
          return; // leave collector running
        } else {
          finalName = rawName;
        }

        await modalSubmit.deferUpdate().catch((): null => null);
        c.stop('confirmed');
        resolve({
          result: 'confirmed',
          finalName,
          shouldCrop: wasOriginallyImage && (!cropClicked || cropChoice),
        });
      }
    });

    c.on('end', (_: any, reason: string) => {
      if (reason !== 'confirmed' && reason !== 'cancelled') resolve({ result: 'timeout' });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk guild select — no name modal, no crop
// ─────────────────────────────────────────────────────────────────────────────

async function runBulkGuildSelect(opts: {
  panel:            any;
  token:            string;
  shownGuilds:      { id: string; name: string }[];
  truncated:        boolean;
  firstTarget:      StealBulkTarget;
  selectedGuildIds: string[];
  authorId:         string;
}): Promise<'confirmed' | 'cancel' | 'timeout'> {
  const { panel, token, shownGuilds, truncated, firstTarget, selectedGuildIds, authorId } = opts;

  await panel.edit(buildStealGuildSelectPayload({
    type:         firstTarget.kind,
    originalName: firstTarget.name,
    imageUrl:     firstTarget.imageUrl,
    guilds:       shownGuilds,
    token,
    truncated,
    isImage:      false,
    cropClicked:  false,
    cropChoice:   true,
  })).catch((): null => null);

  return new Promise((resolve) => {
    const c = panel.createMessageComponentCollector({
      filter: (i: any) => authorOnlyFilter(i, authorId, (cid) => cid.endsWith(`:${token}`)),
      time:   120_000,
    });

    c.on('collect', async (i: any) => {
      if (i.isStringSelectMenu?.() && i.customId === `steal:guilds:${token}`) {
        selectedGuildIds.splice(0, selectedGuildIds.length, ...(i.values as string[]));
        await i.deferUpdate().catch((): null => null);
        return;
      }
      if (!i.isButton?.()) return;

      if (i.customId === `steal:cancel:${token}`) {
        await i.deferUpdate().catch((): null => null);
        c.stop('cancelled'); resolve('cancel');
        return;
      }
      if (i.customId === `steal:confirm-guilds:${token}`) {
        if (!selectedGuildIds.length) { await i.deferUpdate().catch((): null => null); return; }
        await i.deferUpdate().catch((): null => null);
        c.stop('confirmed'); resolve('confirmed');
      }
    });

    c.on('end', (_: any, reason: string) => {
      if (reason !== 'confirmed' && reason !== 'cancelled') resolve('timeout');
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Command
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx   = { message };
  const input = args.join(' ').trim();

  // ── Attachment fallback ───────────────────────────────────────────────────
  const attachment    = message.attachments?.first();
  const attachmentUrl: string | null =
    attachment &&
    (attachment.contentType?.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(attachment.url))
      ? (attachment.url as string)
      : null;

  if (!input && !attachmentUrl) {
    return sendError(
      ctx,
      `Provide an emoji, sticker name/ID, image URL, or attach an image.\n-# Usage: \`${client.config.prefix}${options.usage}\``,
    );
  }

  const token = `${message.id}-${Date.now()}`;

  // Shared target variable — resolved either in bulk loop or single flow below
  let target: ResolvedTarget | null = null;

  // ── Multi-token detection ─────────────────────────────────────────────────
  // Split args into tokens; attempt to resolve each as emoji or sticker.
  // If 2+ succeed → bulk mode (no name modal, no crop).
  const tokens = args.filter(Boolean);

  if (tokens.length >= 2) {
    const MAX_BULK_TOKENS = 50;
    if (tokens.length > MAX_BULK_TOKENS) {
      return sendError(ctx, `Too many items. Give up to **${MAX_BULK_TOKENS}** emojis or stickers at once.`);
    }

    const resolved: StealBulkTarget[] = [];
    for (const tok of tokens) {
      const t = await resolveTarget(tok, client, message.guild);
      if (t && t.kind !== 'image') {
        resolved.push({
          kind:     t.kind,
          name:     t.name,
          imageUrl: t.imageUrl,
          animated: t.kind === 'emoji' ? t.animated : undefined,
          tags:     t.kind === 'sticker' ? t.tags : undefined,
        });
      }
    }

    if (resolved.length === 0) {
      return sendError(ctx, `Could not find any emojis or stickers matching the tokens provided.`);
    }

    if (resolved.length === 1) {
      const t = resolved[0]!;
      target = { kind: t.kind, name: t.name, imageUrl: t.imageUrl, animated: t.animated ?? false, tags: t.tags ?? '🎨', sourceGuild: 'Resolved from bulk input' } as any;
    }

    if (resolved.length >= 2) {
      // ── Bulk flow ─────────────────────────────────────────────────────────
      const panel = await message.channel.send(
        buildStealBulkPreviewPayload({ targets: resolved, token }),
      );

      const previewResult = await new Promise<'continue' | 'cancel' | 'timeout'>((res) => {
        const c = panel.createMessageComponentCollector({
          filter: (i: any) => authorOnlyFilter(i, message.author.id, (cid) => cid.endsWith(`:${token}`)),
          max: 1, time: 30_000,
        });
        c.on('collect', async (i: any) => {
          await i.deferUpdate().catch((): null => null);
          res(i.customId === `steal:continue:${token}` ? 'continue' : 'cancel');
        });
        c.on('end', (_: any, reason: string) => { if (reason === 'time') res('timeout'); });
      });

      if (previewResult === 'cancel')  { await panel.edit(buildStealCancelledPayload()).catch((): null => null); return; }
      if (previewResult === 'timeout') { await panel.edit(buildStealTimedOutPayload()).catch((): null => null);  return; }

      const allMutual = await getMutualGuilds(client, message.author.id);
      if (!allMutual.length) {
        await panel.edit(buildStealCancelledPayload()).catch((): null => null);
        return sendError(ctx, 'No mutual servers found between you and the bot.');
      }

      const truncated    = allMutual.length > 25;
      const shownGuilds  = allMutual.slice(0, 25);
      const selectedIds: string[] = [];

      const selectResult = await runBulkGuildSelect({
        panel, token, shownGuilds, truncated,
        firstTarget: resolved[0]!,
        selectedGuildIds: selectedIds,
        authorId: message.author.id,
      });

      if (selectResult === 'cancel')  { await panel.edit(buildStealCancelledPayload()).catch((): null => null); return; }
      if (selectResult === 'timeout') { await panel.edit(buildStealTimedOutPayload()).catch((): null => null);  return; }
      if (!selectedIds.length) {
        await panel.edit(buildStealCancelledPayload()).catch((): null => null); return;
      }

      await panel.edit(
        buildStealProgressPayload({
          name:       `${resolved.length} items`,
          type:       resolved[0]!.kind,
          imageUrl:   resolved[0]!.imageUrl,
          guildCount: selectedIds.length,
        }),
      ).catch((): null => null);

      const bulkResults: {
        guildName: string;
        added:     string[];
        failed:    { name: string; error: string }[];
      }[] = [];

      for (const guildId of selectedIds) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          bulkResults.push({ guildName: `Unknown (${guildId})`, added: [], failed: resolved.map((t) => ({ name: t.name, error: 'Guild not in cache' })) });
          continue;
        }
        const added:  string[]                     = [];
        const failed: { name: string; error: string }[] = [];

        for (const t of resolved) {
          const err = t.kind === 'emoji'
            ? await addEmoji(guild, t.imageUrl, t.name)
            : await addSticker(guild, t.imageUrl, t.name, t.tags ?? '🎨');
          if (err) failed.push({ name: t.name, error: err });
          else     added.push(t.name);
        }

        bulkResults.push({ guildName: guild.name, added, failed });
      }

      await panel.edit(buildStealBulkResultPayload({ results: bulkResults })).catch((): null => null);
      return;
    }

    // resolved.length === 1 → single flow handled above via `target` assignment
  }

  // ── Single-target flow ────────────────────────────────────────────────────
  if (!target) {
    target = input ? await resolveTarget(input, client, message.guild) : null;
    if (!target && attachmentUrl) target = { kind: 'image', url: attachmentUrl };
    if (!target) {
      return sendError(ctx, `Could not find an emoji, sticker, or valid image URL matching \`${input}\`.`);
    }
  }

  let assetType:         StealAssetType;
  let originalName:      string;
  let imageUrl:          string;
  let stickerTags:       string | undefined;
  let wasOriginallyImage = false;

  let panel: any;

  // ── Preview / type-select ─────────────────────────────────────────────────
  if (target.kind === 'image') {
    wasOriginallyImage = true;
    imageUrl           = target.url;
    originalName       = 'image';

    panel = await message.channel.send(
      buildStealImageTypeSelectPayload({ imageUrl, token }),
    );

    const chosen = await new Promise<StealAssetType | 'cancel' | 'timeout'>((res) => {
      const c = panel.createMessageComponentCollector({
        filter: (i: any) => authorOnlyFilter(i, message.author.id, (cid) => cid.endsWith(`:${token}`)),
        max: 1, time: 30_000,
      });
      c.on('collect', async (i: any) => {
        await i.deferUpdate().catch((): null => null);
        if      (i.customId === `steal:as-emoji:${token}`)   res('emoji');
        else if (i.customId === `steal:as-sticker:${token}`) res('sticker');
        else res('cancel');
      });
      c.on('end', (_: any, reason: string) => { if (reason === 'time') res('timeout'); });
    });

    if ((chosen as string) === 'cancel')  { await panel.edit(buildStealCancelledPayload()).catch((): null => null); return; }
    if ((chosen as string) === 'timeout') { await panel.edit(buildStealTimedOutPayload()).catch((): null => null);  return; }

    assetType = chosen as StealAssetType;
    if (assetType === 'sticker') stickerTags = '🎨';

  } else if (target.kind === 'emoji') {
    assetType    = 'emoji';
    originalName = target.name;
    imageUrl     = target.imageUrl;

    panel = await message.channel.send(
      buildStealPreviewPayload({ type: 'emoji', name: originalName, imageUrl, animated: target.animated, sourceGuild: target.sourceGuild, token }),
    );

    const r = await new Promise<'continue' | 'cancel' | 'timeout'>((res) => {
      const c = panel.createMessageComponentCollector({
        filter: (i: any) => authorOnlyFilter(i, message.author.id, (cid) => cid.endsWith(`:${token}`)),
        max: 1, time: 30_000,
      });
      c.on('collect', async (i: any) => {
        await i.deferUpdate().catch((): null => null);
        res(i.customId === `steal:continue:${token}` ? 'continue' : 'cancel');
      });
      c.on('end', (_: any, reason: string) => { if (reason === 'time') res('timeout'); });
    });

    if (r === 'cancel')  { await panel.edit(buildStealCancelledPayload()).catch((): null => null); return; }
    if (r === 'timeout') { await panel.edit(buildStealTimedOutPayload()).catch((): null => null);  return; }

  } else {
    assetType    = 'sticker';
    originalName = target.name;
    imageUrl     = target.imageUrl;
    stickerTags  = target.tags;

    panel = await message.channel.send(
      buildStealPreviewPayload({ type: 'sticker', name: originalName, imageUrl, sourceGuild: target.sourceGuild, token }),
    );

    const r = await new Promise<'continue' | 'cancel' | 'timeout'>((res) => {
      const c = panel.createMessageComponentCollector({
        filter: (i: any) => authorOnlyFilter(i, message.author.id, (cid) => cid.endsWith(`:${token}`)),
        max: 1, time: 30_000,
      });
      c.on('collect', async (i: any) => {
        await i.deferUpdate().catch((): null => null);
        res(i.customId === `steal:continue:${token}` ? 'continue' : 'cancel');
      });
      c.on('end', (_: any, reason: string) => { if (reason === 'time') res('timeout'); });
    });

    if (r === 'cancel')  { await panel.edit(buildStealCancelledPayload()).catch((): null => null); return; }
    if (r === 'timeout') { await panel.edit(buildStealTimedOutPayload()).catch((): null => null);  return; }
  }

  // ── Guild select + name modal ─────────────────────────────────────────────
  const allMutual = await getMutualGuilds(client, message.author.id);
  if (!allMutual.length) {
    await panel.edit(buildStealCancelledPayload()).catch((): null => null);
    return sendError(ctx, 'No mutual servers found between you and the bot.');
  }

  const truncated   = allMutual.length > 25;
  const shownGuilds = allMutual.slice(0, 25);
  const selectedIds: string[] = [];

  const { result, finalName, shouldCrop } = await runGuildSelect({
    panel, token, shownGuilds, truncated,
    assetType, originalName, imageUrl,
    wasOriginallyImage,
    selectedGuildIds: selectedIds,
    client,
    authorId: message.author.id,
  });

  if (result === 'cancel')  { await panel.edit(buildStealCancelledPayload()).catch((): null => null); return; }
  if (result === 'timeout') { await panel.edit(buildStealTimedOutPayload()).catch((): null => null);  return; }
  if (!finalName || !selectedIds.length) {
    await panel.edit(buildStealCancelledPayload()).catch((): null => null); return;
  }

  // ── Execute ───────────────────────────────────────────────────────────────
  await panel.edit(
    buildStealProgressPayload({ name: finalName, type: assetType, imageUrl, guildCount: selectedIds.length }),
  ).catch((): null => null);

  let assetData: string | Buffer = imageUrl;
  if (shouldCrop) {
    try {
      assetData = await cropToSquare(imageUrl);
    } catch (e: unknown) {
      console.error('[steal] cropToSquare failed, using original URL:', e);
    }
  }

  const results: { guildName: string; ok: boolean; error?: string }[] = [];

  for (const guildId of selectedIds) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      results.push({ guildName: `Unknown (${guildId})`, ok: false, error: 'Guild not in cache' });
      continue;
    }
    const err = assetType === 'emoji'
      ? await addEmoji(guild, assetData, finalName)
      : await addSticker(guild, assetData, finalName, stickerTags ?? '🎨');
    results.push({ guildName: guild.name, ok: err === null, error: err ?? undefined });
  }

  await panel.edit(
    buildStealResultPayload({ name: finalName, type: assetType, imageUrl, results }),
  ).catch((): null => null);
}
