// xoxo/components/utility/serverinfo.ts
//
// All CV2 payload builders for the $serverinfo command.
// Tabs: Overview · Community · Counts · Security · Assets
//
// The command file handles data-fetching and the collector; all Discord
// message construction (ContainerBuilder, etc.) lives here.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import { emojis } from '../../emojis.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ServerTab = 'overview' | 'community' | 'counts' | 'security' | 'assets';
export type AssetType = 'icon' | 'banner' | 'splash' | 'discovery';

export interface ServerState {
  tab:       ServerTab;
  assetType: AssetType;
}

export interface ServerData {
  guild:            any;
  ownerTag:         string | null;   // fetched User tag/username
  memberCount:      number;
  onlineCount:      number;          // approximate from presences
  humanCount:       number;
  botCount:         number;
  iconUrl:          string | null;
  bannerUrl:        string | null;
  splashUrl:        string | null;
  discoverySplashUrl: string | null;
}

export interface SIds {
  overview:  string;
  community: string;
  counts:    string;
  security:  string;
  assets:    string;
  assetIcon: string;
  assetBanner: string;
  assetSplash: string;
  assetDiscovery: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ID factory
// ─────────────────────────────────────────────────────────────────────────────

export function makeSIds(guildId: string): SIds {
  return {
    overview:       `si:overview:${guildId}`,
    community:      `si:community:${guildId}`,
    counts:         `si:counts:${guildId}`,
    security:       `si:security:${guildId}`,
    assets:         `si:assets:${guildId}`,
    assetIcon:      `si:asset_icon:${guildId}`,
    assetBanner:    `si:asset_banner:${guildId}`,
    assetSplash:    `si:asset_splash:${guildId}`,
    assetDiscovery: `si:asset_discovery:${guildId}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

export const CV2_FLAGS = {
  flags:           MessageFlags.IsComponentsV2,
  allowedMentions: { parse: [] as any[] },
} as const;

function wrap(container: ContainerBuilder): any {
  return { components: [container], ...CV2_FLAGS };
}

export function buildTabRow(ids: SIds, active: ServerTab, disabled = false): ActionRowBuilder<ButtonBuilder> {
  const btn = (id: string, label: string, isActive: boolean) =>
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(isActive ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(disabled);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(ids.overview,  'Overview',  active === 'overview'),
    btn(ids.community, 'Community', active === 'community'),
    btn(ids.counts,    'Counts',    active === 'counts'),
    btn(ids.security,  'Security',  active === 'security'),
    btn(ids.assets,    'Assets',    active === 'assets'),
  );
}

function title(guild: any): string {
  return `## ${emojis.blackCards} Server Information — ${guild.name}`;
}

function ts(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `<t:${s}:F> (<t:${s}:R>)`;
}

function verificationLabel(level: number): string {
  return ['None', 'Low', 'Medium', 'High', 'Very High'][level] ?? 'Unknown';
}

function contentFilterLabel(level: number): string {
  return ['Disabled', 'Members Without Roles', 'All Members'][level] ?? 'Unknown';
}

function mfaLabel(level: number): string {
  return level === 1 ? 'Required' : 'Not Required';
}

function nsfwLabel(level: number): string {
  return ['Default', 'Explicit', 'Safe', 'Age Restricted'][level] ?? 'Unknown';
}

function boostTierLabel(tier: number): string {
  return tier === 0 ? 'None (Tier 0)' : `Tier ${tier}`;
}

function channelTypeLabel(type: number): string {
  const m: Record<number, string> = {
    0: 'Text', 2: 'Voice', 4: 'Category', 5: 'Announcement',
    10: 'Announcement Thread', 11: 'Public Thread', 12: 'Private Thread',
    13: 'Stage', 15: 'Forum', 16: 'Media',
  };
  return m[type] ?? 'Other';
}

function localeLabel(locale: string): string {
  const map: Record<string, string> = {
    'en-US': 'English (US)', 'en-GB': 'English (UK)', 'de': 'German',
    'fr': 'French', 'es-ES': 'Spanish', 'it': 'Italian', 'nl': 'Dutch',
    'pt-BR': 'Portuguese (Brazil)', 'ja': 'Japanese', 'ko': 'Korean',
    'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)',
    'ru': 'Russian', 'pl': 'Polish', 'tr': 'Turkish', 'sv-SE': 'Swedish',
    'da': 'Danish', 'no': 'Norwegian', 'fi': 'Finnish', 'uk': 'Ukrainian',
    'hu': 'Hungarian', 'ro': 'Romanian', 'bg': 'Bulgarian', 'cs': 'Czech',
    'hr': 'Croatian', 'lt': 'Lithuanian', 'el': 'Greek', 'vi': 'Vietnamese',
    'th': 'Thai', 'id': 'Indonesian',
  };
  return map[locale] ?? locale;
}

function formatFeatures(features: string[]): string {
  if (!features.length) return 'None';
  const pretty = features.map(f =>
    f.split('_').map((w: string) => w[0] + w.slice(1).toLowerCase()).join(' '),
  );
  return pretty.join(', ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview tab
// ─────────────────────────────────────────────────────────────────────────────

function buildOverview(data: ServerData, ids: SIds, state: ServerState, disabled: boolean, requesterUsername: string): any {
  const { guild } = data;
  const createdEpoch = Math.floor(guild.createdTimestamp / 1000);

  const features: string[] = (guild.features as string[]) ?? [];
  const isPartnered  = features.includes('PARTNERED');
  const isVerified   = features.includes('VERIFIED');
  const isCommunity  = features.includes('COMMUNITY');
  const isDiscoverable = features.includes('DISCOVERABLE');

  const vanityUrl   = guild.vanityURLCode ? `discord.gg/${guild.vanityURLCode}` : null;
  const description = guild.description || null;

  const badges: string[] = [];
  if (isPartnered)   badges.push('Partner');
  if (isVerified)    badges.push('Verified');
  if (isCommunity)   badges.push('Community');
  if (isDiscoverable) badges.push('Discoverable');

  const lines = [
    `${emojis.whiteArrow} **__Overview__**`,
    `**Name:** ${guild.name}`,
    `**Server ID:** \`${guild.id}\``,
    `**Owner:** <@${guild.ownerId}>${data.ownerTag ? ` (${data.ownerTag})` : ''}`,
    `**Created:** ${ts(guild.createdTimestamp)}`,
    `**Region / Locale:** ${localeLabel(guild.preferredLocale)}`,
    description ? `**Description:** ${description}` : `**Description:** None`,
    vanityUrl ? `**Vanity URL:** ${vanityUrl}` : null,
    badges.length ? `**Badges:** ${badges.join(' · ')}` : null,
    `**Features:** ${formatFeatures(features)}`,
  ].filter(Boolean).join('\n');

  const thumb = data.iconUrl;
  const section = thumb
    ? new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
    : null;

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(title(guild)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (section) {
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(buildTabRow(ids, state.tab, disabled))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Requested by ${requesterUsername}`));

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Community tab  (member counts + boost info + special server channels)
// ─────────────────────────────────────────────────────────────────────────────

function buildCommunity(data: ServerData, ids: SIds, state: ServerState, disabled: boolean, requesterUsername: string): any {
  const { guild } = data;

  // Roles
  const boostRole    = guild.premiumSubscriberRole ?? null;
  const boostRoleTxt = boostRole ? `<@&${boostRole.id}>` : 'None';

  // System / rules channels
  const systemChannel = guild.systemChannel ? `<#${guild.systemChannel.id}>` : 'None';
  const rulesChannel  = guild.rulesChannel   ? `<#${guild.rulesChannel.id}>`  : 'None';
  const publicUpdatesChannel = guild.publicUpdatesChannel ? `<#${guild.publicUpdatesChannel.id}>` : 'None';

  // AFK
  const afkChannel = guild.afkChannel ? `<#${guild.afkChannel.id}>` : 'None';
  const afkTimeout = guild.afkTimeout ? `${guild.afkTimeout / 60} min` : 'N/A';

  const lines = [
    `${emojis.whiteArrow} **__Members__**`,
    `**Total Members:** ${data.memberCount.toLocaleString()}`,
    `**Humans:** ${data.humanCount.toLocaleString()}`,
    `**Bots:** ${data.botCount.toLocaleString()}`,
    '',
    `${emojis.whiteArrow} **__Boosts__**`,
    `**Boost Tier:** ${boostTierLabel(guild.premiumTier)}`,
    `**Boost Count:** ${guild.premiumSubscriptionCount?.toLocaleString() ?? '0'}`,
    `**Booster Role:** ${boostRoleTxt}`,
    '',
    `${emojis.whiteArrow} **__Channels__**`,
    `**System Channel:** ${systemChannel}`,
    `**Rules Channel:** ${rulesChannel}`,
    `**Updates Channel:** ${publicUpdatesChannel}`,
    `**AFK Channel:** ${afkChannel}`,
    `**AFK Timeout:** ${afkTimeout}`,
  ].join('\n');

  const thumb = data.iconUrl;
  const section = thumb
    ? new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
    : null;

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(title(guild)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (section) {
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(buildTabRow(ids, state.tab, disabled))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Requested by ${requesterUsername}`));

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Counts tab  (channel type breakdown + expressions)
// ─────────────────────────────────────────────────────────────────────────────

function buildCounts(data: ServerData, ids: SIds, state: ServerState, disabled: boolean, requesterUsername: string): any {
  const { guild } = data;
  const channels = [...(guild.channels?.cache?.values() ?? [])];

  const countType = (t: number) => channels.filter((c: any) => c.type === t).length;

  const text         = countType(0);
  const voice        = countType(2);
  const category     = countType(4);
  const announcement = countType(5);
  const stage        = countType(13);
  const forum        = countType(15);
  const media        = countType(16);
  const total        = channels.length;

  const emojisCount   = guild.emojis?.cache?.size ?? 0;
  const stickersCount = guild.stickers?.cache?.size ?? 0;
  const rolesCount    = (guild.roles?.cache?.size ?? 1) - 1; // subtract @everyone

  const lines = [
    `${emojis.whiteArrow} **__Channel Breakdown__**`,
    `**Text:** ${text.toLocaleString()}`,
    `**Voice:** ${voice.toLocaleString()}`,
    `**Category:** ${category.toLocaleString()}`,
    `**Announcement:** ${announcement.toLocaleString()}`,
    `**Stage:** ${stage.toLocaleString()}`,
    `**Forum:** ${forum.toLocaleString()}`,
    `**Media:** ${media.toLocaleString()}`,
    `**Total:** ${total.toLocaleString()}`,
    '',
    `${emojis.whiteArrow} **__Expressions__**`,
    `**Custom Emojis:** ${emojisCount.toLocaleString()}`,
    `**Stickers:** ${stickersCount.toLocaleString()}`,
    `**Roles:** ${rolesCount.toLocaleString()}`,
  ].join('\n');

  const thumb = data.iconUrl;
  const section = thumb
    ? new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
    : null;

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(title(guild)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (section) {
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(buildTabRow(ids, state.tab, disabled))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Requested by ${requesterUsername}`));

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Security tab
// ─────────────────────────────────────────────────────────────────────────────

function buildSecurity(data: ServerData, ids: SIds, state: ServerState, disabled: boolean, requesterUsername: string): any {
  const { guild } = data;

  const roles = [...(guild.roles?.cache?.values() ?? [])]
    .filter((r: any) => r.id !== guild.id)
    .sort((a: any, b: any) => b.position - a.position)
    .slice(0, 12);

  const roleList = roles.length
    ? roles.map((r: any, i: number) => `**${i + 1}.** <@&${r.id}>`).join('\n')
    : 'No roles.';

  const totalRoles = (guild.roles?.cache?.size ?? 1) - 1;

  const lines = [
    `${emojis.whiteArrow} **__Security__**`,
    `**Verification Level:** ${verificationLabel(guild.verificationLevel)}`,
    `**2FA Requirement:** ${mfaLabel(guild.mfaLevel)}`,
    `**Content Filter:** ${contentFilterLabel(guild.explicitContentFilter)}`,
    `**NSFW Level:** ${nsfwLabel(guild.nsfwLevel)}`,
    '',
    `${emojis.whiteArrow} **__Roles (${totalRoles} total)__**`,
    `${roleList}`,
    totalRoles > 12 ? `*…and ${totalRoles - 12} more*` : '',
  ].filter(l => l !== undefined).join('\n');

  const thumb = data.iconUrl;
  const section = thumb
    ? new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb))
    : null;

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(title(guild)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (section) {
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(buildTabRow(ids, state.tab, disabled))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Requested by ${requesterUsername}`));

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Assets tab
// ─────────────────────────────────────────────────────────────────────────────

function buildAssets(data: ServerData, ids: SIds, state: ServerState, disabled: boolean, requesterUsername: string): any {
  const { guild } = data;

  // Determine which asset types exist
  const assets: { key: AssetType; label: string; url: string | null }[] = [
    { key: 'icon',      label: 'Icon',              url: data.iconUrl },
    { key: 'banner',    label: 'Banner',            url: data.bannerUrl },
    { key: 'splash',    label: 'Invite Splash',     url: data.splashUrl },
    { key: 'discovery', label: 'Discovery Splash',  url: data.discoverySplashUrl },
  ];

  // Active asset — fall back to first available if the current selection has no URL.
  // Determine both the displayed asset and the "effective" type to highlight the right button.
  let active = assets.find(a => a.key === state.assetType);
  if (!active?.url) {
    active = assets.find(a => !!a.url) ?? assets[0];
  }
  const currentUrl    = active?.url ?? null;
  const effectiveType = active?.key ?? state.assetType;

  const btnId = (key: AssetType): string => {
    const m: Record<AssetType, string> = {
      icon: ids.assetIcon, banner: ids.assetBanner,
      splash: ids.assetSplash, discovery: ids.assetDiscovery,
    };
    return m[key];
  };

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(title(guild)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.whiteArrow} **__${active?.label ?? 'Asset'}__**`));

  if (currentUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(currentUrl)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('None.'));
  }

  // Asset type switcher row — use effectiveType so the button for the *displayed*
  // asset is highlighted, even if state.assetType pointed to an unavailable asset.
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...assets.map(a =>
        new ButtonBuilder()
          .setCustomId(btnId(a.key))
          .setLabel(a.label)
          .setStyle(effectiveType === a.key ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(disabled || !a.url),
      ),
      ...(currentUrl
        ? [new ButtonBuilder().setURL(currentUrl).setLabel('Download').setStyle(ButtonStyle.Link)]
        : []
      ),
    ),
  );

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(buildTabRow(ids, state.tab, disabled))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Requested by ${requesterUsername}`));

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher (exported — used by the command)
// ─────────────────────────────────────────────────────────────────────────────

export function buildServerPayload(
  data:              ServerData,
  ids:               SIds,
  state:             ServerState,
  disabled:          boolean,
  requesterUsername: string,
): any {
  switch (state.tab) {
    case 'overview':   return buildOverview(data, ids, state, disabled, requesterUsername);
    case 'community':  return buildCommunity(data, ids, state, disabled, requesterUsername);
    case 'counts':     return buildCounts(data, ids, state, disabled, requesterUsername);
    case 'security':   return buildSecurity(data, ids, state, disabled, requesterUsername);
    case 'assets':     return buildAssets(data, ids, state, disabled, requesterUsername);
  }
}
