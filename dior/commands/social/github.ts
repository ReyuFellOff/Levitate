// xoxo/commands/social/github.ts
//
// $github <username> — show a GitHub profile and recent repositories.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { buildGithubPayload } from '../../components/social/github.js';
import { sendError, sendLoading } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import { fetchGithubProfile, GithubError } from '../../helpers/github.js';

export const options = {
  name: 'github',
  aliases: [] as string[],
  description: 'Show a GitHub profile and recent repositories.',
  usage: 'github <username>',
  category: 'socials',
  owner: false,
  cooldown: 5,
};

async function lookup(ctx: { message?: any; interaction?: any }, username: string): Promise<any> {
  try {
    return await fetchGithubProfile(username);
  } catch (error: unknown) {
    if (error instanceof GithubError) return sendError(ctx, error.message);
    console.error(`[github] Lookup error: ${error instanceof Error ? error.message : String(error)}`);
    return sendError(ctx, 'GitHub could not be reached right now. Please try again in a moment.');
  }
}

export async function prefixExecute(
  message: any,
  args: string[],
  _client: LevitateClient,
): Promise<any> {
  if (args.length !== 1) return sendWrongUsage({ message }, options.name, options.usage);

  const username = args[0].trim();
  const loading: any = await sendLoading({ message }, `Looking up GitHub user **${username}**…`);
  const profile = await lookup({ message }, username);
  await loading?.delete?.().catch((): null => null);
  if (!profile || profile instanceof GithubError) return profile;
  return message.channel.send(buildGithubPayload(profile));
}

export async function slashExecute(interaction: any, _client: LevitateClient): Promise<any> {
  const username = interaction.options.getString('username', true).trim();
  await interaction.deferReply();
  const profile = await lookup({ interaction }, username);
  if (!profile || profile instanceof GithubError) return profile;
  return interaction.editReply(buildGithubPayload(profile));
}