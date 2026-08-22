import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import { sendError } from '../../components/statusMessages.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';

export const options = {
  name: 'song-cover',
  aliases: ['cover', 'songcover', 'coverart'] as string[],
  description: 'Search iTunes for a song and show its cover art.',
  usage: 'song-cover <song name or "Song Name - Artist Name">',
  category: 'music',
  owner: false,
  cooldown: 8,
};

function buildSongCoverPayload({ title, artist, imageUrl }: { title: string; artist: string; imageUrl: string }): any {
  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title} - ${artist}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imageUrl),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Extracted using iTunes Search API.'),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function fetchItunesSong(query: string): Promise<{ title: string; artist: string; artworkUrl: string }> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Please provide a song name or a "Song Name - Artist Name" query.');

  try {
    const url = new URL('https://itunes.apple.com/search');
    url.searchParams.set('term', trimmed);
    url.searchParams.set('entity', 'song');
    url.searchParams.set('limit', '1');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`iTunes API request failed (${response.status}). Please try again.`);
    }

    const data = (await response.json()) as any;
    const results = data?.results;

    if (!results || results.length === 0) {
      throw new Error(`No matching song found for **${trimmed}** on iTunes. Try a different query.`);
    }

    const song = results[0];
    let artworkUrl = song?.artworkUrl100;

    if (!artworkUrl) {
      throw new Error(`No cover art found for **${trimmed}** on iTunes.`);
    }

    // Convert image to high resolution by replacing 100x100bb with 600x600bb
    artworkUrl = artworkUrl.replace('100x100bb', '600x600bb');

    return {
      title: String(song.trackName || 'Unknown title').trim() || 'Unknown title',
      artist: String(song.artistName || 'Unknown artist').trim() || 'Unknown artist',
      artworkUrl,
    };
  } catch (err: any) {
    if (err.message.includes('No matching song') || err.message.includes('No cover art')) {
      throw err;
    }
    throw new Error(`Network error while fetching from iTunes: ${err?.message || 'Unknown error'}`);
  }
}

async function resolveSongCover(query: string): Promise<{ title: string; artist: string; imageUrl: string }> {
  const song = await fetchItunesSong(query);

  return {
    title: song.title,
    artist: song.artist,
    imageUrl: song.artworkUrl,
  };
}

export async function prefixExecute(
  message: any,
  args: string[],
  _client: LevitateClient,
): Promise<any> {
  const query = args.join(' ').trim();
  if (!query) {
    return sendError({ message }, 'Please provide a song name or a "Song Name - Artist Name" query.');
  }

  try {
    const result = await resolveSongCover(query);
    return message.channel.send(buildSongCoverPayload(result));
  } catch (err: any) {
    return sendError({ message }, err?.message || 'Could not fetch the song cover art.');
  }
}

export async function slashExecute(interaction: any, _client: LevitateClient): Promise<any> {
  const query = interaction.options.getString('query', true)?.trim();
  if (!query) {
    return sendError({ interaction }, 'Please provide a song name or a "Song Name - Artist Name" query.');
  }

  await interaction.deferReply();

  try {
    const result = await resolveSongCover(query);
    return interaction.editReply(buildSongCoverPayload(result));
  } catch (err: any) {
    return sendError({ interaction }, err?.message || 'Could not fetch the song cover art.');
  }
}
