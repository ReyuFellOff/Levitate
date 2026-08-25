// xoxo/commands/fun/tictactoe.ts
//
// $tictactoe / $ttt — challenge another member (or the bot itself, if no user
// is given) to a game of tic tac toe.
//
// Usage:
//   $tictactoe              — challenge the bot (plays optimally via minimax)
//   $tictactoe <@user>      — challenge another member
//
// Flow:
//   1. A 3x3 button grid is sent; players alternate clicking cells.
//   2. Moves from the non-active player are ignored.
//   3. Bot opponent picks the best cell (minimax) after a short delay.
//   4. Board disables on win/draw/timeout (2 minutes of inactivity).

import { MessageFlags } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildTicTacToePayload,
  bestBotMove,
  checkWinner,
  isDraw,
  tttCustomId,
  type Board,
} from '../../components/fun/tictactoe.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'tictactoe',
  aliases:     ['ttt'] as string[],
  description: 'Play tic tac toe against another member or the bot.',
  usage:       'tictactoe\ntictactoe <@user|ID|username>',
  category:    'fun',
  owner:       false,
  cooldown:    5,
};

const ROUND_TIME = 2 * 60_000; // 2 minutes

async function endGame(
  gameMsg: any,
  board:   Board,
  p1Name:  string,
  p2Name:  string,
  msgId:   string,
): Promise<void> {
  const winner = checkWinner(board);
  let status: string;
  if (winner === 'X')      status = `**${p1Name}** wins!`;
  else if (winner === 'O') status = `**${p2Name}** wins!`;
  else                     status = `It's a draw!`;

  await gameMsg
    .edit(buildTicTacToePayload({ msgId, board, turnName: '', p1Name, p2Name, status, disabled: true }))
    .catch((): null => null);
}

function startCollector(
  gameMsg:  any,
  board:    Board,
  msgId:    string,
  p1Id:     string,
  p2Id:     string | null, // null when the opponent is the bot
  p1Name:   string,
  p2Name:   string,
  turn:     'X' | 'O',
): void {
  const activeId = turn === 'X' ? p1Id : p2Id;

  const collector = gameMsg.createMessageComponentCollector({
    filter: (i: any) => i.customId.startsWith(`ttt:${msgId}:`),
    time:   ROUND_TIME,
  });

  collector.on('collect', async (i: any) => {
    // Human-vs-human: enforce whose turn it is
    if (p2Id !== null && i.user.id !== activeId) {
      return i.reply({ content: "It's not your turn.", flags: MessageFlags.Ephemeral }).catch((): null => null);
    }
    // Human-vs-bot: only player 1 can click
    if (p2Id === null && i.user.id !== p1Id) {
      return i.reply({ content: "This isn't your game.", flags: MessageFlags.Ephemeral }).catch((): null => null);
    }

    const index = parseInt(i.customId.split(':')[2], 10);
    if (board[index] !== null) return i.deferUpdate().catch((): null => null);

    await i.deferUpdate().catch((): null => null);
    board[index] = turn;
    collector.stop('moved');

    if (checkWinner(board) || isDraw(board)) {
      return endGame(gameMsg, board, p1Name, p2Name, msgId);
    }

    const nextTurn: 'X' | 'O' = turn === 'X' ? 'O' : 'X';

    // Bot's turn — minimax then auto-play after a short delay.
    if (p2Id === null && nextTurn === 'O') {
      await gameMsg
        .edit(buildTicTacToePayload({ msgId, board, turnName: `${p2Name} is thinking...`, p1Name, p2Name }))
        .catch((): null => null);

      setTimeout(async () => {
        const cell = bestBotMove(board);
        if (cell === -1) return;
        board[cell] = 'O';

        if (checkWinner(board) || isDraw(board)) {
          return endGame(gameMsg, board, p1Name, p2Name, msgId);
        }

        await gameMsg
          .edit(buildTicTacToePayload({ msgId, board, turnName: p1Name, p1Name, p2Name }))
          .catch((): null => null);

        startCollector(gameMsg, board, msgId, p1Id, p2Id, p1Name, p2Name, 'X');
      }, 700);
      return;
    }

    const nextTurnName = nextTurn === 'X' ? p1Name : p2Name;
    await gameMsg
      .edit(buildTicTacToePayload({ msgId, board, turnName: nextTurnName, p1Name, p2Name }))
      .catch((): null => null);

    startCollector(gameMsg, board, msgId, p1Id, p2Id, p1Name, p2Name, nextTurn);
  });

  collector.on('end', (_collected: any, reason: string) => {
    if (reason !== 'time') return;
    gameMsg
      .edit(buildTicTacToePayload({ msgId, board, turnName: '', p1Name, p2Name, status: 'Game timed out.', disabled: true }))
      .catch((): null => null);
  });
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  let opponent: any = null;
  if (args.length > 0) {
    const resolved = await resolveUser(client, message.guild, args[0]);
    if (!resolved) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);
    if (resolved.id === message.author.id) return sendError(ctx, "You can't challenge yourself.");
    if (resolved.bot) return sendError(ctx, "You can't challenge another bot — use `$tictactoe` with no args to play against me.");
    opponent = resolved;
  }

  const p1Name = message.member?.displayName ?? message.author.username;
  const p2Name = opponent
    ? (await message.guild.members.fetch(opponent.id).catch((): null => null))?.displayName
      ?? opponent.globalName ?? opponent.username
    : (client.config?.botName ?? client.user?.username ?? 'Bot');

  const board: Board  = Array(9).fill(null);
  const scopeId       = message.id;

  const gameMsg = await message.channel
    .send(buildTicTacToePayload({ msgId: scopeId, board, turnName: p1Name, p1Name, p2Name }))
    .catch((): null => null);
  if (!gameMsg) return;

  startCollector(
    gameMsg,
    board,
    scopeId,
    message.author.id,
    opponent ? opponent.id : null,
    p1Name,
    p2Name,
    'X',
  );
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();
  if (!interaction.guild) return sendError({ interaction }, 'This command can only be used in a server.');

  const rawOpponent = interaction.options.getUser('user') ?? null;

  if (rawOpponent) {
    if (rawOpponent.id === interaction.user.id)
      return sendError({ interaction }, "You can't challenge yourself.");
    if (rawOpponent.bot)
      return sendError({ interaction }, "You can't challenge another bot — leave the user blank to play against me.");
  }

  const p1Name = (interaction.member as any)?.displayName ?? interaction.user.username;
  const p2Name = rawOpponent
    ? ((await interaction.guild.members.fetch(rawOpponent.id).catch((): null => null)) as any)?.displayName
        ?? rawOpponent.globalName ?? rawOpponent.username
    : (client.config?.botName ?? client.user?.username ?? 'Bot');

  const board: Board = Array(9).fill(null);
  const scopeId      = interaction.id;

  const gameMsg = await interaction.editReply(
    buildTicTacToePayload({ msgId: scopeId, board, turnName: p1Name, p1Name, p2Name }),
  );

  startCollector(
    gameMsg,
    board,
    scopeId,
    interaction.user.id,
    rawOpponent ? rawOpponent.id : null,
    p1Name,
    p2Name,
    'X',
  );
}
