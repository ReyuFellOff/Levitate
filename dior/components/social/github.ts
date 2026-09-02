// xoxo/components/social/github.ts
//
// Components V2 presentation for the social/github command.

import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import type { GithubProfile } from '../../helpers/github.js';
import { emojis } from '../../emojis.js';

const NO_MENTIONS = { parse: [] as any[] };

function safe(value: string | null | undefined, max = 300): string {
  return String(value ?? '')
    .replace(/([\\`*_{}[\]()<>#+.!|])/g, '\\$1')
    .slice(0, max);
}

function formatCreatedAt(value: string): string {
  const timestamp = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(timestamp) ? `<t:${timestamp}:D> (<t:${timestamp}:R>)` : 'Unknown';
}

function formatRepositoryDate(value: string | null): string {
  const timestamp = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return 'Unknown date';
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

function buildRepositoryLines(profile: GithubProfile): string {
  if (!profile.repositories.length) return 'No public repositories.';

  const lines = profile.repositories.map((repository) =>
    `${emojis.smallYellowStar} ${repository.stargazers_count.toLocaleString()}, ${formatRepositoryDate(repository.pushed_at ?? repository.updated_at)} ` +
    `[${safe(repository.name, 80)}](${repository.html_url})`,
  );
  return lines.join('\n');
}

export function buildGithubPayload(profile: GithubProfile): any {
  const displayName = safe(profile.name || profile.login, 120);
  const login = safe(profile.login, 80);
  const bio = profile.bio ? `\n${safe(profile.bio, 280)}` : '';
  const body = [
    `**Created:** ${formatCreatedAt(profile.created_at)}`,
    '',
    `**Repositories (${profile.public_repos.toLocaleString()}):**`,
    buildRepositoryLines(profile),
  ].join('\n');

  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${displayName} (@${login})${bio}`),
      new TextDisplayBuilder().setContent(body),
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(profile.avatar_url));

  const container = new ContainerBuilder()
    .setAccentColor(profile.accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# GitHub'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(header)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`[View @${login} on GitHub](${profile.html_url})`),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: NO_MENTIONS,
  };
}