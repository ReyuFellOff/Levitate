// xoxo/commands/fun/rps.ts
//
// $rps / $rockpaperscissors — play rock paper scissors.
//
// Usage:
//   $rps          — play against the bot
//   $rps @user    — challenge another user (PvP)
//
// All button handling is in the global interactionCreate handler (no message
// collectors), so every click is always acknowledged properly.

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError }           from '../../components/statusMessages.js';
import { resolveUser }         from '../../helpers/userResolver.js';
import {
  buildSoloPickPayload,
  buildChallengePayload,
  registerRpsSession,
} from '../../components/fun/rps.js';

export const options = {
  name:        'rps',
  aliases:     ['rockpaperscissors'] as string[],
  description: 'Play rock paper scissors against the bot, or challenge another user.',
  usage:       'rps [user]',
  category:    'fun',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const scopeId    = message.id;
  const authorName = message.member?.displayName ?? message.author.username;
  const authorId   = message.author.id as string;
  const botName    = client.config?.botName ?? client.user?.username ?? 'Bot';

  // ── PvP mode: a user was mentioned or resolved by username/ID ───────────────
  const hasTargetArg = args.length > 0;
  const mentionedUser = message.mentions.users.first()
    ?? (hasTargetArg ? await resolveUser(client, message.guild, args[0]) : null);

  if (hasTargetArg && !mentionedUser) {
    return sendError(ctx, 'Could not find that user. Provide a valid mention, user ID, or username.');
  }

  if (mentionedUser) {
    if (mentionedUser.id === authorId)
      return sendError(ctx, "You can't challenge yourself.");
    if (mentionedUser.bot)
      return sendError(ctx, "You can't challenge a bot.");

    const opponentMember = message.guild.members.cache.get(mentionedUser.id)
      ?? await message.guild.members.fetch(mentionedUser.id).catch((): null => null);

    const opponentName = opponentMember?.displayName ?? mentionedUser.username;

    const gameMsg = await message.channel
      .send(buildChallengePayload(scopeId, authorName, `<@${mentionedUser.id}>`))
      .catch((): null => null);
    if (!gameMsg) return;

    registerRpsSession(scopeId, {
      mode:         'pvp',
      state:        'pending_accept',
      authorId,
      authorName,
      opponentId:   mentionedUser.id,
      opponentName,
      botName,
      guildId:      message.guild.id,
      channelId:    message.channel.id,
      botMsgId:     gameMsg.id,
      client,
    });
    return;
  }

  // ── Solo mode: play against the bot ─────────────────────────────────────────
  const gameMsg = await message.channel
    .send(buildSoloPickPayload(scopeId, authorName))
    .catch((): null => null);
  if (!gameMsg) return;

  registerRpsSession(scopeId, {
    mode:      'solo',
    state:     'picking',
    authorId,
    authorName,
    botName,
    guildId:   message.guild.id,
    channelId: message.channel.id,
    botMsgId:  gameMsg.id,
    client,
  });
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();

  const scopeId    = interaction.id;
  const authorName = (interaction.member as any)?.displayName ?? interaction.user.username;
  const authorId   = interaction.user.id as string;
  const botName    = client.config?.botName ?? client.user?.username ?? 'Bot';

  const mentionedUser = interaction.options.getUser('user') ?? null;

  if (mentionedUser) {
    if (mentionedUser.id === authorId)
      return sendError({ interaction }, "You can't challenge yourself.");
    if (mentionedUser.bot)
      return sendError({ interaction }, "You can't challenge a bot.");

    const opponentMember = interaction.guild
      ? await interaction.guild.members.fetch(mentionedUser.id).catch((): null => null)
      : null;
    const opponentName   = (opponentMember as any)?.displayName ?? mentionedUser.username;

    const msg = await interaction.editReply(
      buildChallengePayload(scopeId, authorName, `<@${mentionedUser.id}>`),
    );

    registerRpsSession(scopeId, {
      mode:         'pvp',
      state:        'pending_accept',
      authorId,
      authorName,
      opponentId:   mentionedUser.id,
      opponentName,
      botName,
      guildId:      interaction.guildId,
      channelId:    interaction.channelId,
      botMsgId:     msg.id,
      client,
    });
    return;
  }

  // Solo mode
  const msg = await interaction.editReply(buildSoloPickPayload(scopeId, authorName));

  registerRpsSession(scopeId, {
    mode:      'solo',
    state:     'picking',
    authorId,
    authorName,
    botName,
    guildId:   interaction.guildId,
    channelId: interaction.channelId,
    botMsgId:  msg.id,
    client,
  });
}
