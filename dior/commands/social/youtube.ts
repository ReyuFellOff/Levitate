// xoxo/commands/social/youtube.ts
//
// $youtube <channel-name-or-id> — show a YouTube channel's details.

import type { CassieClient } from '../../structures/CassieClient.js';
import { buildYoutubePayload } from '../../components/social/youtube.js';
import { sendError, sendLoading } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';

export const options = {
  name: 'youtube',
  aliases: ['yt', 'ytchannel'] as string[],
  description: 'Fetch and display YouTube channel details.',
  usage: 'youtube <channel-name-or-id>',
  category: 'socials',
  owner: false,
  cooldown: 5,
};

const YOUTUBE_API_KEY = process.env['YOUTUBE_API_KEY'];
const YOUTUBE_SEARCH_API = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_CHANNELS_API = 'https://www.googleapis.com/youtube/v3/channels';

interface YouTubeChannelResponse {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      customUrl?: string;
      publishedAt: string;
      thumbnails: {
        default?: { url: string };
        medium?: { url: string };
        high?: { url: string };
      };
    };
    statistics: {
      viewCount: string;
      subscriberCount: string;
      videoCount: string;
      hiddenSubscriberCount: boolean;
    };
  }>;
}

/**
 * Fetch channel data from YouTube API.
 */
async function fetchChannelData(identifier: string): Promise<YouTubeChannelResponse | null> {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YouTube API key is not configured.');
  }

  let channelId: string | null = null;

  // Check if identifier is already a channel ID (starts with UC and is 24 chars)
  if (identifier.startsWith('UC') && identifier.length === 24) {
    channelId = identifier;
  } else {
    // Search for the channel by name/handle
    const searchUrl = `${YOUTUBE_SEARCH_API}?key=${YOUTUBE_API_KEY}&type=channel&part=snippet&q=${encodeURIComponent(identifier)}&maxResults=1`;

    try {
      const searchResponse = await fetch(searchUrl);
      if (!searchResponse.ok) {
        return null;
      }
      const searchData = (await searchResponse.json()) as any;
      
      if (!searchData.items || searchData.items.length === 0) {
        return null;
      }
      
      channelId = searchData.items[0].id.channelId;
    } catch (error) {
      console.error('YouTube Search API error:', error);
      throw error;
    }
  }

  // Now fetch full channel details using the channelId
  const channelUrl = `${YOUTUBE_CHANNELS_API}?key=${YOUTUBE_API_KEY}&part=snippet,statistics&id=${encodeURIComponent(channelId)}`;

  try {
    const response = await fetch(channelUrl);
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as YouTubeChannelResponse;
    return data.items?.length > 0 ? data : null;
  } catch (error) {
    console.error('YouTube Channels API error:', error);
    throw error;
  }
}

export async function prefixExecute(
  message: any,
  args: string[],
  _client: CassieClient,
): Promise<any> {
  if (!args.length) return sendWrongUsage({ message }, options.name, options.usage);

  const identifier = args.join(' ').trim();
  let loading: any = null;

  try {
    loading = await sendLoading({ message }, `Searching for YouTube channel **${identifier}**…`);

    const channelData = await fetchChannelData(identifier);

    if (!channelData) {
      await loading?.delete?.().catch((): null => null);
      return sendError({ message }, `Could not find a YouTube channel with the name or ID: \`${identifier}\``);
    }

    await loading?.delete?.().catch((): null => null);
    const channel = channelData.items[0];
    return message.channel.send(buildYoutubePayload(channel, message.author.username));
  } catch (error) {
    await loading?.delete?.().catch((): null => null);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred.';
    return sendError({ message }, `Failed to fetch YouTube channel data: ${errorMsg}`);
  }
}

export async function slashExecute(interaction: any, _client: CassieClient): Promise<any> {
  const identifier = interaction.options.getString('channel', true).trim();
  await interaction.deferReply();

  try {
    const channelData = await fetchChannelData(identifier);

    if (!channelData) {
      return sendError({ interaction }, `Could not find a YouTube channel with the name or ID: \`${identifier}\``);
    }

    const channel = channelData.items[0];
    return interaction.editReply(buildYoutubePayload(channel));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred.';
    return sendError({ interaction }, `Failed to fetch YouTube channel data: ${errorMsg}`);
  }
}
