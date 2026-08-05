// xoxo/components/utility/vanity.ts
//
// CV2 payload builder for the $vanity command.
// Shows server details (icon thumbnail, banner image, member/online counts,
// invite link) if the vanity is taken, or an availability notice if free.

import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { emojis } from '../../emojis.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const FLAGS = {
  flags:           MessageFlags.IsComponentsV2,
  allowedMentions: { parse: [] as any[] },
};

function wrap(c: ContainerBuilder): any {
  return { components: [c], ...FLAGS };
}

function line(label: string, value: string): string {
  return `${emojis.whiteArrow} **${label}:** ${value}`;
}

/** Build a CDN icon URL from a guild id + icon hash (handles animated hashes). */
function iconUrl(guildId: string, hash: string | null | undefined, size = 256): string | null {
  if (!hash) return null;
  const ext = hash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${hash}.${ext}?size=${size}`;
}

/** Build a CDN banner URL from a guild id + banner hash. */
function bannerUrl(guildId: string, hash: string | null | undefined, size = 1024): string | null {
  if (!hash) return null;
  const ext = hash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/banners/${guildId}/${hash}.${ext}?size=${size}`;
}

/** Format a raw count from the API (number | undefined) → display string. */
function fmtCount(raw: number | undefined | null): string {
  if (raw == null || Number.isNaN(Number(raw))) return '—';
  return Number(raw).toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildVanityPayload(opts: {
  code:            string;
  invite:          any | null;   // null → vanity is available
  invokerUsername: string;
}): any {
  const { code, invite, invokerUsername } = opts;
  const vanityUrl = `discord.gg/${code}`;

  // ── Vanity is AVAILABLE ───────────────────────────────────────────────────
  if (!invite || !invite.guild) {
    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${emojis.greenTick} Vanity Available`),
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `${emojis.whiteArrow} **\`${vanityUrl}\`** is not claimed by any server.`,
            `${emojis.whiteArrow} It's all yours — grab it while you can!`,
          ].join('\n'),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Requested by ${invokerUsername}`),
      );

    return wrap(container);
  }

  // ── Vanity is TAKEN ───────────────────────────────────────────────────────
  const guild = invite.guild;

  const serverName  = guild.name ?? 'Unknown Server';
  const serverId    = guild.id   ?? 'Unknown';
  const memberCount = fmtCount(invite.approximate_member_count);
  const onlineCount = fmtCount(invite.approximate_presence_count);

  const icon   = iconUrl(serverId, guild.icon);
  const banner = bannerUrl(serverId, guild.banner);

  const infoText = [
    line('Server Name', serverName),
    line('Server ID',   `\`${serverId}\``),
    line('Members',     `\`${memberCount}\``),
    line('Online',      `\`${onlineCount}\``),
  ].join('\n');

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blackCross} Vanity: In Use`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  // Server info — with icon thumbnail if available
  if (icon) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(icon)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));
  }

  // Invite link
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [`${emojis.whiteArrow} **Invite Link:** https://${vanityUrl}`].join('\n'),
      ),
    );

  // Banner — no heading, no extra separator, just the gallery right after invite
  if (banner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(banner),
      ),
    );
  }

  // Footer
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Requested by ${invokerUsername}`),
    );

  return wrap(container);
}

/** Build a compact lookup result for the guild where the command was used. */
export function buildCurrentGuildVanityPayload(opts: {
  guild:           any;
  invokerUsername: string;
}): any {
  const { guild, invokerUsername } = opts;
  const code = guild.vanityURLCode ?? null;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${code ? `${emojis.blackCross} Server Vanity` : `${emojis.info} Server Vanity`}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        code
          ? [
              `${emojis.whiteArrow} **Server:** ${guild.name}`,
              `${emojis.whiteArrow} **Vanity URL:** https://discord.gg/${code}`,
            ].join('\n')
          : `${emojis.whiteArrow} **${guild.name}** does not have a vanity URL.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Requested by ${invokerUsername}`),
    );

  return wrap(container);
}
