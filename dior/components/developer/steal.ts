import { config } from '../../config.js';
// xoxo/components/developer/steal.ts
//
// CV2 payload builders for the $steal developer command.
// Flow: preview → (type select if image) → guild select + crop toggle → modal name → result.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export type StealAssetType = 'emoji' | 'sticker';

function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function gallery(imageUrl: string) {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(imageUrl),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Preview (found emoji or sticker)
// ─────────────────────────────────────────────────────────────────────────────

export function buildStealPreviewPayload(opts: {
  type:        'emoji' | 'sticker';
  name:        string;
  imageUrl:    string;
  animated?:   boolean;
  sourceGuild: string;
  token:       string;
}): any {
  const { type, name, imageUrl, animated, sourceGuild, token } = opts;
  const typeLabel = type === 'emoji'
    ? (animated ? 'Animated Emoji' : 'Emoji')
    : 'Sticker';

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Steal — ${typeLabel}`),
    )
    .addMediaGalleryComponents(gallery(imageUrl))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Name:** \`${name}\`\n**Type:** ${typeLabel}\n**From:** ${sourceGuild}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`steal:continue:${token}`)
          .setLabel('Continue')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`steal:cancel:${token}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger),
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1b — Preview for raw image URL (type not yet known)
// ─────────────────────────────────────────────────────────────────────────────

export function buildStealImageTypeSelectPayload(opts: {
  imageUrl: string;
  token:    string;
}): any {
  const { imageUrl, token } = opts;

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Steal — Image URL'),
    )
    .addMediaGalleryComponents(gallery(imageUrl))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Save this image as an **emoji** or a **sticker**?',
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`steal:as-emoji:${token}`)
          .setLabel('Emoji')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`steal:as-sticker:${token}`)
          .setLabel('Sticker')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`steal:cancel:${token}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger),
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Guild selection + optional crop toggle
// ─────────────────────────────────────────────────────────────────────────────

export function buildStealGuildSelectPayload(opts: {
  type:         StealAssetType;
  originalName: string;
  imageUrl:     string;
  guilds:       { id: string; name: string }[];
  token:        string;
  truncated:    boolean;
  isImage:      boolean;
  cropClicked:  boolean;
  cropChoice:   boolean;
}): any {
  const { type, originalName, imageUrl, guilds, token, truncated, isImage, cropClicked, cropChoice } = opts;
  const typeLabel = type === 'emoji' ? 'Emoji' : 'Sticker';
  const shown     = guilds.slice(0, 25);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`steal:guilds:${token}`)
    .setPlaceholder('Select one or more servers...')
    .setMinValues(1)
    .setMaxValues(shown.length)
    .addOptions(
      shown.map((g) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(g.name.slice(0, 100))
          .setValue(g.id),
      ),
    );

  // Crop button styles: both grey until clicked, then selected = green
  const yesStyle = cropClicked && cropChoice   ? ButtonStyle.Success : ButtonStyle.Secondary;
  const noStyle  = cropClicked && !cropChoice  ? ButtonStyle.Success : ButtonStyle.Secondary;

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Steal — Select Server${shown.length > 1 ? 's' : ''}`),
    )
    .addMediaGalleryComponents(gallery(imageUrl))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Type:** ${typeLabel}\n**Original name:** \`${originalName}\`\n` +
        (truncated
          ? `-# Showing first 25 of your mutual servers with the bot.`
          : `-# ${shown.length} mutual server${shown.length !== 1 ? 's' : ''} available.`),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
    );

  // Crop to 1:1 toggle — only for image inputs
  if (isImage) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('**Crop to 1:1 (centered)?**'),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`steal:crop-yes:${token}`)
          .setLabel('Yes')
          .setStyle(yesStyle),
        new ButtonBuilder()
          .setCustomId(`steal:crop-no:${token}`)
          .setLabel('No')
          .setStyle(noStyle),
      ),
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`steal:confirm-guilds:${token}`)
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`steal:cancel:${token}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger),
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Name modal — triggered by the Confirm button
// ─────────────────────────────────────────────────────────────────────────────

export function buildStealNameModal(
  token:        string,
  type:         StealAssetType,
  originalName: string,
): ModalBuilder {
  const maxLen = type === 'emoji' ? 32 : 30;
  const label  = `${type === 'emoji' ? 'Emoji' : 'Sticker'} name (blank = keep original)`;

  return new ModalBuilder()
    .setCustomId(`steal:name-modal:${token}`)
    .setTitle(`Name for ${type}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(`steal:name-input:${token}`)
          .setLabel(label.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`Default: "${originalName.slice(0, 95)}"`)
          .setRequired(false)
          .setMaxLength(maxLen),
      ),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk preview — multiple emojis / stickers at once
// ─────────────────────────────────────────────────────────────────────────────

export type StealBulkTarget = {
  kind:     'emoji' | 'sticker';
  name:     string;
  imageUrl: string;
  animated?: boolean;
  tags?:    string;
};

export function buildStealBulkPreviewPayload(opts: {
  targets: StealBulkTarget[];
  token:   string;
}): any {
  const { targets, token } = opts;
  const emojiCount   = targets.filter((t) => t.kind === 'emoji').length;
  const stickerCount = targets.filter((t) => t.kind === 'sticker').length;

  const parts: string[] = [];
  if (emojiCount)   parts.push(`${emojiCount} emoji${emojiCount   !== 1 ? 's' : ''}`);
  if (stickerCount) parts.push(`${stickerCount} sticker${stickerCount !== 1 ? 's' : ''}`);

  const lines = targets.map((t) => `- \`${t.name}\` (${t.kind})`);

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Steal — ${parts.join(' + ')}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `All items will be added using their **original names**.\n\n${lines.join('\n')}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`steal:continue:${token}`)
          .setLabel('Continue')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`steal:cancel:${token}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger),
      ),
    );

  return wrap(container);
}

export function buildStealBulkResultPayload(opts: {
  results: {
    guildName: string;
    added:     string[];
    failed:    { name: string; error: string }[];
  }[];
}): any {
  const { results } = opts;
  const totalAdded  = results.reduce((s, r) => s + r.added.length,  0);
  const totalFailed = results.reduce((s, r) => s + r.failed.length, 0);
  const summary     = totalFailed === 0
    ? `Added **${totalAdded}** item${totalAdded !== 1 ? 's' : ''} across **${results.length}** server${results.length !== 1 ? 's' : ''}.`
    : `Added **${totalAdded}** items, **${totalFailed}** failed.`;

  const lines = results.map((r) => {
    if (!r.failed.length) return `- \`${r.guildName}\` — ${r.added.length} added`;
    const failLines = r.failed.map((f) => `  - ~~\`${f.name}\`~~ — ${f.error}`).join('\n');
    return `- \`${r.guildName}\` — ${r.added.length} added, ${r.failed.length} failed\n${failLines}`;
  });

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Steal Complete`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${summary}\n\n${lines.join('\n')}`),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress / intermediate states
// ─────────────────────────────────────────────────────────────────────────────

export function buildStealProgressPayload(opts: {
  name:       string;
  type:       StealAssetType;
  imageUrl:   string;
  guildCount: number;
}): any {
  const { name, type, imageUrl, guildCount } = opts;
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Steal — Adding...`),
    )
    .addMediaGalleryComponents(gallery(imageUrl))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Adding \`${name}\` (${type}) to ${guildCount} server${guildCount !== 1 ? 's' : ''}...`,
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Result
// ─────────────────────────────────────────────────────────────────────────────

export function buildStealResultPayload(opts: {
  name:     string;
  type:     StealAssetType;
  imageUrl: string;
  results:  { guildName: string; ok: boolean; error?: string }[];
}): any {
  const { name, type, imageUrl, results } = opts;
  const succeeded = results.filter((r) => r.ok).length;
  const failed    = results.filter((r) => !r.ok).length;

  const lines = results.map((r) =>
    r.ok
      ? `- \`${r.guildName}\``
      : `- ~~\`${r.guildName}\`~~ — ${r.error ?? 'Unknown error'}`,
  );

  const summaryLine = succeeded === results.length
    ? `Added \`${name}\` to all **${succeeded}** server${succeeded !== 1 ? 's' : ''}.`
    : `Added to **${succeeded}** server${succeeded !== 1 ? 's' : ''}. **${failed}** failed.`;

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Steal Complete`),
    )
    .addMediaGalleryComponents(gallery(imageUrl))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${summaryLine}\n**Name:** \`${name}\` (${type})\n\n${lines.join('\n')}`,
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancelled / timed-out states
// ─────────────────────────────────────────────────────────────────────────────

export function buildStealCancelledPayload(): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Steal cancelled.'),
    ),
  );
}

export function buildStealTimedOutPayload(): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Steal timed out — no response received.'),
    ),
  );
}
