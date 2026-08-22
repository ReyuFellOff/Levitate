import { config } from '../../config.js';
// xoxo/components/info/tmdb.ts
//
// Components V2 presentation for TMDB movie and TV-show results.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import type { TmdbMediaDetails } from '../../helpers/tmdb.js';
import { tmdbImageUrl } from '../../helpers/tmdb.js';
import { escapeFormatting, truncate } from '../../utils/formatting.js';
import { emojis } from '../../emojis.js';

const NO_MENTIONS = { parse: [] as any[] };

function safe(value: unknown, max = 300): string {
  return escapeFormatting(truncate(String(value ?? ''), max));
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return 'Unknown';
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours}h ${remaining}m` : `${remaining}m`;
}

function getDirector(details: TmdbMediaDetails): string | null {
  const director = details.credits?.crew?.find((person) => person.job === 'Director');
  return director?.name ?? null;
}

function getTrailerUrl(details: TmdbMediaDetails): string | null {
  const video = details.videos?.results?.find((item) =>
    item.site === 'YouTube' && item.type === 'Trailer',
  ) ?? details.videos?.results?.find((item) => item.site === 'YouTube');
  return video?.key ? `https://www.youtube.com/watch?v=${video.key}` : null;
}

function getProviders(details: TmdbMediaDetails): string[] {
  const us = details['watch/providers']?.results?.US;
  if (!us) return [];
  const providers = [
    ...(us.flatrate ?? []),
    ...(us.rent ?? []),
    ...(us.buy ?? []),
  ].map((provider) => provider.provider_name);
  return [...new Set(providers)].slice(0, 6);
}

function getCertification(details: TmdbMediaDetails): string {
  if (details.mediaType === 'movie') {
    const usRelease = details.release_dates?.results?.find(
      (country) => country.iso_3166_1 === 'US',
    );
    return usRelease?.release_dates?.find((release) => release.certification?.trim())
      ?.certification?.trim() ?? 'Not rated';
  }

  return details.content_ratings?.results?.find(
    (country) => country.iso_3166_1 === 'US',
  )?.rating?.trim() ?? 'Not rated';
}

function buildDetailsText(details: TmdbMediaDetails): string {
  const isMovie = details.mediaType === 'movie';
  const title = details.title ?? details.name ?? 'Untitled';
  const date = isMovie ? details.release_date : details.first_air_date;
  const genres = details.genres?.map((genre) => genre.name).join(', ');
  const cast = details.credits?.cast
    ?.slice(0, 5)
    .map((person) => person.character ? `${person.name} as ${person.character}` : person.name)
    .join(', ');
  const providers = getProviders(details);
  const director = getDirector(details);
  const runtime = isMovie
    ? formatRuntime(details.runtime)
    : `${details.number_of_seasons ?? '?'} season${details.number_of_seasons === 1 ? '' : 's'} • ` +
      `${details.number_of_episodes ?? '?'} episode${details.number_of_episodes === 1 ? '' : 's'}`;

  const lines = [
    `**${isMovie ? 'Release date' : 'First aired'}:** ${formatDate(date)}`,
    `**Status:** ${safe(details.status || 'Unknown', 80)}`,
    `**Runtime:** ${runtime}`,
    `**IMDb Rating:** ${details.imdbRating ? `${details.imdbRating.toFixed(1)}/10` : 'Unavailable'}${details.imdbVoteCount ? ` (${details.imdbVoteCount.toLocaleString()} votes)` : ''}`,
    `**TMDB Rating:** ${details.vote_average ? `${details.vote_average.toFixed(1)}/10` : 'Not rated'} (${(details.vote_count ?? 0).toLocaleString()} votes)`,
    `**Rated:** ${getCertification(details)}`,
    genres ? `**Genres:** ${safe(genres, 180)}` : '',
    director ? `**Director:** ${safe(director, 120)}` : '',
    !isMovie && details.last_air_date ? `**Last aired:** ${formatDate(details.last_air_date)}` : '',
    cast ? `**Cast:** ${safe(cast, 280)}` : '',
    providers.length ? `**US availability:** ${safe(providers.join(', '), 220)}` : '',
    '',
    `> ${safe(details.overview || 'No overview is available for this title.', 850)}`,
  ].filter(Boolean);

  return lines.join('\n');
}

export function buildTmdbPayload(details: TmdbMediaDetails) {
  const isMovie = details.mediaType === 'movie';
  const title = details.title ?? details.name ?? 'Untitled';
  const originalTitle = details.original_title ?? details.original_name;
  const quote = details.quote ?? details.tagline;
  const imageUrl = tmdbImageUrl(details.poster_path);
  const tmdbUrl = `https://www.themoviedb.org/${isMovie ? 'movie' : 'tv'}/${details.id}`;
  const trailerUrl = getTrailerUrl(details);
  const imdbUrl = details.external_ids?.imdb_id
    ? `https://www.imdb.com/title/${details.external_ids.imdb_id}/`
    : null;

  const header = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# ${isMovie ? `${emojis.Cinema} Movie` : `${emojis.KuromiTV} TV show`}\n## ${safe(title, 180)}`,
    ),
    new TextDisplayBuilder().setContent(
      quote
        ? `*"${safe(quote, 360)}"*`
        : originalTitle && originalTitle !== title
          ? `Original title: ${safe(originalTitle, 180)}`
          : 'No quote is available for this title.',
    ),
  );
  if (imageUrl) {
    header.setThumbnailAccessory(new ThumbnailBuilder().setURL(imageUrl));
  }

  const buttons = [
    new ButtonBuilder()
      .setLabel('View on TMDB')
      .setStyle(ButtonStyle.Link)
      .setURL(tmdbUrl),
  ];
  if (trailerUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Watch trailer')
        .setStyle(ButtonStyle.Link)
        .setURL(trailerUrl),
    );
  }
  if (details.homepage) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Official website')
        .setStyle(ButtonStyle.Link)
        .setURL(details.homepage),
    );
  }
  if (imdbUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('View on IMDb')
        .setStyle(ButtonStyle.Link)
        .setURL(imdbUrl),
    );
  }

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addSectionComponents(header)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildDetailsText(details)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(buttons),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Data and images provided by The Movie Database (TMDB). IMDb rating and quote data provided by IMDb.'),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications,
    allowedMentions: NO_MENTIONS,
  };
}