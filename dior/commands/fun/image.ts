// xoxo/commands/fun/image.ts
//
// Search for an image and display it in a CV2 panel with prev/next navigation.
//
// Usage:
//   $image <query>
//
// Fetches results from Bing Images with strict safe-search enforced.
// Up to 8 results are stored in a session; Prev / Next buttons let the user
// browse through them. Session expires after 3 minutes of inactivity.

import type { LevitateClient }  from '../../structures/LevitateClient.js';
import { sendError, sendLoading } from '../../components/statusMessages.js';
import {
  searchImages,
  buildImagePayload,
  buildSingleImagePayload,
  registerImageSession,
  type ImageSession,
} from '../../components/fun/image.js';

export const options = {
  name:        'image',
  aliases:     ['img', 'imagesearch'] as string[],
  description: 'Search for an image and browse results.',
  usage:       'image <query>',
  category:    'socials',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!args.length) {
    return sendError(ctx, 'Please provide a search query. Usage: `$image <query>`');
  }

  const query = args.join(' ').trim();

  // Show loading state while fetching
  const loadingMsg: any = await sendLoading(ctx, `Searching for **${query}**…`);

  let results: Awaited<ReturnType<typeof searchImages>>;

  try {
    results = await searchImages(query);
  } catch (err) {
    await loadingMsg?.delete().catch((): null => null);
    return sendError(ctx, 'Could not fetch image results. Please try again later.');
  }

  if (!results.length) {
    await loadingMsg?.delete().catch((): null => null);
    return sendError(ctx, `No safe images found for **${query}**. Try a different search term.`);
  }

  await loadingMsg?.delete().catch((): null => null);

  // Single result — no navigation buttons needed
  if (results.length === 1) {
    return message.channel.send(buildSingleImagePayload(results[0], query));
  }

  // Multiple results — set up session and navigation.
  // We need the real message ID before building button customIds, so:
  //   1) send the first image without nav buttons (single-image payload)
  //   2) obtain the message ID
  //   3) register the session under that ID
  //   4) edit the message with the full nav payload whose customIds embed the ID
  const botMsg = await message.channel.send(buildSingleImagePayload(results[0], query));

  const session: ImageSession = {
    results,
    index:     0,
    query,
    authorId:  message.author.id,
    channelId: message.channel.id,
    msgId:     botMsg.id,
    client,
  };

  registerImageSession(botMsg.id, session);

  // Edit with the full nav payload — customIds now contain the real message ID
  await botMsg.edit(buildImagePayload(session)).catch((): null => null);

  return botMsg;
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();

  const query = interaction.options.getString('query') as string;

  let results: Awaited<ReturnType<typeof searchImages>>;
  try {
    results = await searchImages(query);
  } catch {
    return sendError({ interaction }, 'Could not fetch image results. Please try again later.');
  }

  if (!results.length)
    return sendError({ interaction }, `No safe images found for **${query}**. Try a different search term.`);

  if (results.length === 1)
    return interaction.editReply(buildSingleImagePayload(results[0], query));

  // Multiple results — get the real message ID first, then register session and edit
  const session: ImageSession = {
    results,
    index:     0,
    query,
    authorId:  interaction.user.id,
    channelId: interaction.channelId,
    msgId:     '',
    client,
  };

  const msg = await interaction.editReply(buildSingleImagePayload(results[0], query));
  session.msgId = msg.id;
  registerImageSession(msg.id, session);
  await msg.edit(buildImagePayload(session)).catch((): null => null);
}
