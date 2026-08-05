// xoxo/commands/utility/vanity.ts
//
// $vanity [code] — checks a Discord vanity URL, or shows the current server's vanity.
// If a server is using it: shows name, ID, member counts, icon, banner, invite link.
// If no server has it: reports that it's available.
//
// Uses native fetch directly against the Discord REST API (v10) rather than
// client.rest.get() so that query parameters (with_counts, with_expiration)
// are guaranteed to be appended to the URL — discord.js's REST query option
// can silently drop them in certain call paths.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError }      from '../../components/statusMessages.js';
import {
  buildCurrentGuildVanityPayload,
  buildVanityPayload,
} from '../../components/utility/vanity.js';

export const options = {
  name:        'vanity',
  aliases:     [] as string[],
  description: "Look up a Discord vanity URL, or show this server's vanity when no code is provided.",
  usage:       'vanity [code]',
  category:    'utility',
  owner:       false,
  cooldown:    5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Vanity fetch — direct HTTP call so query params are always applied
// ─────────────────────────────────────────────────────────────────────────────

async function fetchInvite(
  code:  string,
  token: string,
): Promise<{ data: any | null; httpStatus: number }> {
  const url = `https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent':  'DiscordBot (Levitate, 1.0.0)',
      },
    });
  } catch {
    return { data: null, httpStatus: 0 };   // network failure
  }

  if (res.status === 404) return { data: null, httpStatus: 404 };

  let body: any;
  try { body = await res.json(); } catch { body = {}; }

  if (!res.ok) return { data: null, httpStatus: res.status };

  return { data: body, httpStatus: res.status };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix execute
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!args[0]) {
    if (!message.guild) {
      return sendError(ctx, 'Provide a vanity code when using this command outside a server.');
    }
    return message.channel.send(buildCurrentGuildVanityPayload({
      guild:           message.guild,
      invokerUsername: message.author.username,
    }));
  }

  // Strip discord.gg / https:// if the user pastes a full link
  const raw  = args[0].trim().replace(/^(?:https?:\/\/)?(?:www\.)?discord\.gg\//i, '');
  const code = raw.split('/')[0];
  if (!code) return sendError(ctx, 'Please provide a valid vanity code.');

  const token = client.token;
  if (!token) return sendError(ctx, 'Bot token unavailable — cannot reach Discord API.');

  const { data, httpStatus } = await fetchInvite(code, token);

  // 404 or Discord JSON code 10006 → vanity is available
  const discordCode = typeof data?.code === 'number' ? data.code : 0;
  if (httpStatus === 404 || discordCode === 10006) {
    // pass data=null → "available" panel
    return message.channel.send(buildVanityPayload({ code, invite: null, invokerUsername: message.author.username }));
  }

  if (httpStatus === 429) return sendError(ctx, 'Rate-limited by Discord — try again in a moment.');
  if (httpStatus === 0)   return sendError(ctx, 'Network error reaching Discord. Try again in a moment.');
  if (!data || httpStatus >= 400) return sendError(ctx, 'Could not reach Discord API. Try again in a moment.');

  return message.channel.send(buildVanityPayload({
    code,
    invite:          data,
    invokerUsername: message.author.username,
  }));
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();

  const input = interaction.options.getString('code');
  if (!input) {
    if (!interaction.guild) {
      return sendError({ interaction }, 'Provide a vanity code when using this command outside a server.');
    }
    return interaction.editReply(buildCurrentGuildVanityPayload({
      guild:           interaction.guild,
      invokerUsername: interaction.user.username,
    }));
  }

  const raw  = input.trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?discord\.gg\//i, '');
  const code = raw.split('/')[0];
  if (!code) return sendError({ interaction }, 'Please provide a valid vanity code.');

  const token = client.token;
  if (!token) return sendError({ interaction }, 'Bot token unavailable — cannot reach Discord API.');

  const { data, httpStatus } = await fetchInvite(code, token);

  const discordCode = typeof data?.code === 'number' ? data.code : 0;
  if (httpStatus === 404 || discordCode === 10006) {
    return interaction.editReply(buildVanityPayload({ code, invite: null, invokerUsername: interaction.user.username }));
  }

  if (httpStatus === 429) return sendError({ interaction }, 'Rate-limited by Discord — try again in a moment.');
  if (httpStatus === 0)   return sendError({ interaction }, 'Network error reaching Discord. Try again in a moment.');
  if (!data || httpStatus >= 400) return sendError({ interaction }, 'Could not reach Discord API. Try again in a moment.');

  return interaction.editReply(buildVanityPayload({
    code,
    invite:          data,
    invokerUsername: interaction.user.username,
  }));
}
