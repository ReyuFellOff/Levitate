// xoxo/commands/social/cinema.ts
//
// $cinema <movie or TV show> — search TMDB for either type and show details.

import type { CassieClient } from '../../structures/CassieClient.js';
import { buildTmdbPayload } from '../../components/info/tmdb.js';
import { sendError, sendLoading } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import { fetchTmdbCinema, TmdbError } from '../../helpers/tmdb.js';

export const options = {
  name: 'cinema',
  aliases: ['movies', 'tvshow'] as string[],
  description: 'Search TMDB for a movie or TV show and show its details.',
  usage: 'cinema <movie or TV show>',
  category: 'socials',
  owner: false,
  cooldown: 5,
};

async function executeSearch(
  ctx: { message?: any; interaction?: any },
  query: string,
): Promise<any> {
  try {
    const details = await fetchTmdbCinema(query);
    if (!details) {
      return sendError(ctx, `No movie or TV show matching **${query}** was found on TMDB.`);
    }
    return details;
  } catch (err: unknown) {
    if (err instanceof TmdbError && err.code === 'missing-config') {
      return sendError(ctx, 'Cinema search is not configured yet. Please ask the bot owner to add the TMDB credentials.');
    }
    console.error(`[cinema] TMDB error: ${err instanceof Error ? err.message : String(err)}`);
    return sendError(ctx, 'TMDB could not be reached right now. Please try again in a moment.');
  }
}

export async function prefixExecute(
  message: any,
  args: string[],
  _client: CassieClient,
): Promise<any> {
  if (!args.length) return sendWrongUsage({ message }, options.name, options.usage);

  const query = args.join(' ').trim();
  const loading: any = await sendLoading({ message }, `Searching TMDB for **${query}**…`);
  const details = await executeSearch({ message }, query);
  await loading?.delete?.().catch((): null => null);
  if (!details || details instanceof TmdbError) return details;
  return message.channel.send(buildTmdbPayload(details));
}

export async function slashExecute(
  interaction: any,
  _client: CassieClient,
): Promise<any> {
  const query = interaction.options.getString('query', true).trim();
  await interaction.deferReply();
  const details = await executeSearch({ interaction }, query);
  if (!details || details instanceof TmdbError) return details;
  return interaction.editReply(buildTmdbPayload(details));
}