import { config } from '../../config.js';
// xoxo/components/social/youtube.ts
//
// Components V2 presentation for the social/youtube command.

import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { emojis } from '../../emojis.js';

const NO_MENTIONS = { parse: [] as any[] };

interface YouTubeChannel {
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
}

/**
 * Format a large number with commas for readability.
 */
function formatNumber(num: string | number): string {
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (isNaN(n)) return 'N/A';
  return n.toLocaleString();
}

/**
 * Format a date string to a more readable format.
 */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Build the YouTube channel payload for Components V2.
 */
export function buildYoutubePayload(channel: YouTubeChannel, requestedBy?: string): any {
  const { id, snippet, statistics } = channel;
  const title = snippet.title;
  const description = snippet.description || 'No description available.';
  const thumbnail = snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url || snippet.thumbnails.default?.url;

  // Build channel handle and link
  // customUrl comes from API with @ already included (e.g., "@niko")
  const hasCustomUrl = snippet.customUrl && snippet.customUrl.length > 0;
  const handle = hasCustomUrl ? snippet.customUrl : `@${id}`;
  const channelLink = hasCustomUrl 
    ? `https://www.youtube.com/${snippet.customUrl}`
    : `https://www.youtube.com/channel/${id}`;

  // Format the header with clickable link
  const headerLine = `## ${emojis.youtubeEmojiForYoutubeCommand} [${title} ${handle}](${channelLink})`;

  // Format statistics
  const statsContent = [
    `**Subscribers:** ${formatNumber(statistics.subscriberCount)}`,
    `**Total videos:** ${formatNumber(statistics.videoCount)}`,
    `**Total views:** ${formatNumber(statistics.viewCount)}`,
    `**Created at:** ${formatDate(snippet.publishedAt)}`,
  ].join('\n');

  // Build the section with thumbnail
  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(description),
    new TextDisplayBuilder().setContent(statsContent),
  );

  if (thumbnail) {
    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
  }

  // Build the full container
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerLine))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  // Add footer with requested by info if provided
  const footerParts: string[] = [];
  if (requestedBy) {
    footerParts.push(`Requested by ${requestedBy}`);
  }
  footerParts.push('Thank you for using Levitate');

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${footerParts.join(' | ')}`),
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: NO_MENTIONS,
  };
}
