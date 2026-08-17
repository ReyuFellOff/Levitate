// xoxo/components/utility/userinfo.ts
//
// All CV2 payload builders for the $userinfo command.
// The command file (xoxo/commands/utility/userinfo.ts) handles only data
// fetching and collector logic; all Discord message construction lives here.

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
import { PERMISSION_NAMES } from '../../data/discordPermissions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types (exported so the command file can reference them)
// ─────────────────────────────────────────────────────────────────────────────

export type Tab           = 'about' | 'roles' | 'perms' | 'assets';
export type AvatarVariant = 'global' | 'server';
export type BannerVariant = 'global' | 'server';
export type TagVariant    = 'badge' | 'icon';

export interface UIState {
  tab:           Tab;
  avatarVariant: AvatarVariant;
  bannerVariant: BannerVariant;
  tagVariant:    TagVariant;
}

export interface UserData {
  user:            any;          // force-fetched User
  member:          any | null;   // force-fetched GuildMember | null
  guild:           any;
  displayName:     string;       // globalName ?? username
  username:        string;       // pomelo handle
  userId:          string;
  isOwner:         boolean;      // user is the guild owner
  globalAvatarUrl: string;
  serverAvatarUrl: string | null;
  globalBannerUrl: string | null;
  serverBannerUrl: string | null;
  // Server-tag related (resolved from client.guilds.cache in command file)
  tagGuildName:       string | null;  // name of the primaryGuild, if bot is in it
  tagBadgeUrl:        string | null;  // clan badge CDN URL
  tagGuildIconUrl:    string | null;  // primaryGuild icon URL, if available
  tagGuildBannerUrl:  string | null;  // primaryGuild banner URL, if available
}

export interface Ids {
  about:    string;
  roles:    string;
  perms:    string;
  assets:   string;
  avGlobal: string;
  avServer: string;
  bnGlobal: string;
  bnServer: string;
  tagBadge: string;
  tagIcon:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ID factory
// ─────────────────────────────────────────────────────────────────────────────

export function makeIds(uid: string): Ids {
  return {
    about:    `ui:about:${uid}`,
    roles:    `ui:roles:${uid}`,
    perms:    `ui:perms:${uid}`,
    assets:   `ui:assets:${uid}`,
    avGlobal: `ui:av_g:${uid}`,
    avServer: `ui:av_s:${uid}`,
    bnGlobal: `ui:bn_g:${uid}`,
    bnServer: `ui:bn_s:${uid}`,
    tagBadge: `ui:tg_b:${uid}`,
    tagIcon:  `ui:tg_i:${uid}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared CV2 helpers
// ─────────────────────────────────────────────────────────────────────────────

export const CV2_FLAGS = {
  flags:           MessageFlags.IsComponentsV2,
  allowedMentions: { parse: [] as any[] },
} as const;

function wrap(container: ContainerBuilder): any {
  return { components: [container], ...CV2_FLAGS };
}

/** Tab navigation row — active tab is green, rest secondary. */
export function buildTabRow(ids: Ids, activeTab: Tab, disabled = false): ActionRowBuilder<ButtonBuilder> {
  const btn = (id: string, label: string, active: boolean) =>
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(active ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(disabled);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(ids.about,  'About',       activeTab === 'about'),
    btn(ids.roles,  'Roles',       activeTab === 'roles'),
    btn(ids.perms,  'Permissions', activeTab === 'perms'),
    btn(ids.assets, 'Assets',      activeTab === 'assets'),
  );
}

/**
 * Builds a SectionBuilder with text on the left and the avatar thumbnail
 * on the right. Used on About, Roles, and Permissions tabs.
 */
function makeSection(content: string, thumbnailUrl: string): SectionBuilder {
  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));
}

/** Best available avatar for use as thumbnail (server-specific preferred). */
function bestThumbnail(data: UserData): string {
  return data.serverAvatarUrl ?? data.globalAvatarUrl;
}

/** Page title — appends crown if user is the guild owner. */
function buildTitle(data: UserData): string {
  const crown = data.isOwner ? ` ${emojis.blackcrown}` : '';
  return `## ${emojis.whiteButterflies} User Information - ${data.username}${crown}`;
}

/**
 * Resolves the server-tag display string.
 * Rules:
 *   - No primaryGuild          → legacy discriminator (#1234) or "None."
 *   - Has primaryGuild, no tag → "None."
 *   - Has tag                  → the tag identifier only (e.g. "xyz")
 */
function resolveTagDisplay(user: any): string {
  const pg = (user as any).primaryGuild;

  if (!pg) {
    if (user.discriminator && user.discriminator !== '0') {
      return `#${user.discriminator}`;
    }
    return 'None.';
  }

  if (!pg.tag) return 'None.';

  return pg.tag;
}

// ─────────────────────────────────────────────────────────────────────────────
// About tab
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a formatted "Current Status:" line, or null if nothing useful to show. */
function resolveStatusLine(member: any): string | null {
  const presence = member?.presence;
  if (!presence) return null;

  const raw: string = presence.status ?? 'offline';
  // Only surface online/idle/dnd — offline and invisible aren't meaningful to display
  const displayStatus: string | null =
    raw === 'online' || raw === 'idle' || raw === 'dnd' ? raw : null;

  // Custom status is ActivityType.Custom (4) — its text lives in activity.state
  const customActivity = (presence.activities as any[])?.find((a: any) => a.type === 4);
  const statusText: string | null = customActivity?.state ?? null;

  if (!statusText && !displayStatus) return null;

  const parts: string[] = [];
  if (statusText)     parts.push(statusText);
  if (displayStatus)  parts.push(`(${displayStatus})`);

  return `**Current Status:** ${parts.join(' ')}`;
}

function buildAbout(data: UserData, ids: Ids, state: UIState, disabled: boolean, requesterUsername: string): any {
  const registeredEpoch = Math.floor(data.user.createdTimestamp / 1000);
  const joinedEpoch     = data.member?.joinedTimestamp
    ? Math.floor(data.member.joinedTimestamp / 1000)
    : null;

  const tagDisplay  = resolveTagDisplay(data.user);
  const statusLine  = resolveStatusLine(data.member);

  const baseLines = [
    `${emojis.whiteArrow} **__About__**`,
    `**Name:** ${data.displayName}`,
    `**Nickname:** ${data.member?.nickname ?? 'None.'}`,
    `**User ID:** \`${data.userId}\``,
    `**Registered:** <t:${registeredEpoch}:F> (<t:${registeredEpoch}:R>)`,
    joinedEpoch
      ? `**Joined:** <t:${joinedEpoch}:F> (<t:${joinedEpoch}:R>)`
      : '**Joined:** Unknown',
    `**Server Tag:** ${tagDisplay}`,
  ];

  if (statusLine) baseLines.push(statusLine);

  const mainBody = baseLines.join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildTitle(data)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(makeSection(mainBody, bestThumbnail(data)));

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(buildTabRow(ids, state.tab, disabled))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Requested by ${requesterUsername}`),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles tab
// ─────────────────────────────────────────────────────────────────────────────

function buildRoles(data: UserData, ids: Ids, state: UIState, disabled: boolean, requesterUsername: string): any {
  let highestRoleText: string;
  let rolesText:       string;
  let colorText:       string;

  if (!data.member) {
    highestRoleText = 'None.';
    rolesText       = 'Not a server member.';
    colorText       = '#000000';
  } else {
    const roles: any[] = [...(data.member.roles.cache as Map<string, any>).values()]
      .filter((r: any) => r.id !== data.guild.id)
      .sort((a: any, b: any) => b.position - a.position);

    highestRoleText = roles[0] ? `<@&${roles[0].id}>` : 'None.';

    const colourRole = roles.find((r: any) => r.color !== 0);
    colorText = colourRole ? (colourRole.hexColor as string) : '#000000';

    if (roles.length === 0) {
      rolesText = 'None.';
    } else {
      const shown    = roles.slice(0, 10).map((r: any) => `<@&${r.id}>`).join(' ');
      const leftover = roles.length - 10;
      rolesText      = shown + (leftover > 0 ? ` and ${leftover} more.` : '');
    }
  }

  const body = [
    `${emojis.whiteArrow} **__Roles__**`,
    `**Highest Role:** ${highestRoleText}`,
    `**Roles:** ${rolesText}`,
    `**Color:** ${colorText}`,
  ].join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildTitle(data)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(makeSection(body, bestThumbnail(data)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(buildTabRow(ids, state.tab, disabled))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Requested by ${requesterUsername}`),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissions tab
// ─────────────────────────────────────────────────────────────────────────────

function buildPerms(data: UserData, ids: Ids, state: UIState, disabled: boolean, requesterUsername: string): any {
  let permBody: string;

  if (!data.member) {
    permBody = 'Not a server member.';
  } else if (data.isOwner) {
    // Guild owner implicitly has every permission.
    permBody = 'Owner of the server.';
  } else if ((data.member.permissions as any).has('Administrator')) {
    // Administrator encompasses every permission — show a single concise line.
    permBody = 'Administrator - This permission contains all the permissions that are known to exist.';
  } else {
    const names: string[] = (data.member.permissions.toArray() as string[])
      .map((p: string) => PERMISSION_NAMES[p] ?? p)
      .sort();

    if (names.length === 0) {
      permBody = 'None.';
    } else {
      const lines: string[] = [];
      for (let i = 0; i < names.length; i += 2) {
        const pair   = names.slice(i, i + 2);
        const isLast = i + 2 >= names.length;
        lines.push(pair.join(', ') + (isLast ? '' : ','));
      }
      permBody = lines.join('\n');
    }
  }

  const body = `${emojis.whiteArrow} **__Permissions__**\n${permBody}`;

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildTitle(data)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(makeSection(body, bestThumbnail(data)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(buildTabRow(ids, state.tab, disabled))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Requested by ${requesterUsername}`),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Assets tab
// ─────────────────────────────────────────────────────────────────────────────

function buildAssets(data: UserData, ids: Ids, state: UIState, disabled: boolean, requesterUsername: string): any {
  const hasServerAvatar = !!data.serverAvatarUrl;
  const hasGlobalBanner = !!data.globalBannerUrl;
  const hasServerBanner = !!data.serverBannerUrl;
  const hasAnyBanner    = hasGlobalBanner || hasServerBanner;

  // ── Current avatar URL ───────────────────────────────────────────────────
  const currentAvatarUrl =
    state.avatarVariant === 'server' && data.serverAvatarUrl
      ? data.serverAvatarUrl
      : data.globalAvatarUrl;

  // ── Current banner URL ───────────────────────────────────────────────────
  let currentBannerUrl: string | null = null;
  if (hasAnyBanner) {
    if (state.bannerVariant === 'server' && data.serverBannerUrl) {
      currentBannerUrl = data.serverBannerUrl;
    } else {
      currentBannerUrl = data.globalBannerUrl ?? data.serverBannerUrl;
    }
  }


  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildTitle(data)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  // ── Avatar section ────────────────────────────────────────────────────────
  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emojis.whiteArrow} **__Avatar__**`),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(currentAvatarUrl),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ids.avGlobal)
          .setLabel('Global')
          .setStyle(state.avatarVariant === 'global' ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(ids.avServer)
          .setLabel('Server')
          .setStyle(state.avatarVariant === 'server' ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(disabled || !hasServerAvatar),
        new ButtonBuilder()
          .setURL(currentAvatarUrl)
          .setLabel('Download')
          .setStyle(ButtonStyle.Link),
      ),
    );

  // ── Banner section ────────────────────────────────────────────────────────
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('**__Banner__**'),
  );

  if (hasAnyBanner && currentBannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(currentBannerUrl),
      ),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ids.bnGlobal)
          .setLabel('Global')
          .setStyle(state.bannerVariant === 'global' ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(disabled || !hasGlobalBanner),
        new ButtonBuilder()
          .setCustomId(ids.bnServer)
          .setLabel('Server')
          .setStyle(state.bannerVariant === 'server' ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(disabled || !hasServerBanner),
        new ButtonBuilder()
          .setURL(currentBannerUrl)
          .setLabel('Download')
          .setStyle(ButtonStyle.Link),
      ),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('None.'),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ids.bnGlobal)
          .setLabel('Global')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(ids.bnServer)
          .setLabel('Server')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`${ids.bnGlobal}:dl`)
          .setLabel('Download')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      ),
    );
  }

  // ── Server Tag section ────────────────────────────────────────────────────
  // Badge and/or server icon toggled via buttons. "None." if neither exists.
  const hasBadge   = !!data.tagBadgeUrl;
  const hasTagIcon = !!data.tagGuildIconUrl;
  const hasAnyTag  = hasBadge || hasTagIcon;

  const currentTagUrl =
    state.tagVariant === 'badge' && data.tagBadgeUrl ? data.tagBadgeUrl :
    state.tagVariant === 'icon'  && data.tagGuildIconUrl ? data.tagGuildIconUrl :
    data.tagBadgeUrl ?? data.tagGuildIconUrl ?? null;

  const tagName = (data.user as any).primaryGuild?.tag ?? null;
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(tagName ? `**__Server Tag: ${tagName}__**` : '**__Server Tag__**'),
  );

  if (hasAnyTag && currentTagUrl) {
    container
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(currentTagUrl),
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(ids.tagBadge)
            .setLabel('Badge')
            .setStyle(state.tagVariant === 'badge' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(disabled || !hasBadge),
          new ButtonBuilder()
            .setCustomId(ids.tagIcon)
            .setLabel('Server Icon')
            .setStyle(state.tagVariant === 'icon' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(disabled || !hasTagIcon),
          new ButtonBuilder()
            .setURL(currentTagUrl)
            .setLabel('Download')
            .setStyle(ButtonStyle.Link),
        ),
      );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('None.'),
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(buildTabRow(ids, state.tab, disabled))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Requested by ${requesterUsername}`),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload dispatcher (exported — used by the command's runUserInfo)
// ─────────────────────────────────────────────────────────────────────────────

export function buildPayload(
  data:              UserData,
  ids:               Ids,
  state:             UIState,
  disabled:          boolean,
  requesterUsername: string,
): any {
  switch (state.tab) {
    case 'about':  return buildAbout(data, ids, state, disabled, requesterUsername);
    case 'roles':  return buildRoles(data, ids, state, disabled, requesterUsername);
    case 'perms':  return buildPerms(data, ids, state, disabled, requesterUsername);
    case 'assets': return buildAssets(data, ids, state, disabled, requesterUsername);
  }
}
