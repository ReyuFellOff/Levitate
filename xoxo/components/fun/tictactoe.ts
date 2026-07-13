// xoxo/components/fun/tictactoe.ts
//
// CV2 payload builder + board logic for the $tictactoe game.
// Buttons carry the invoking message's ID so collectors can be scoped to a
// single game instance, e.g. `ttt:<messageId>:<cellIndex>`.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { emojis } from '../../emojis.js';

export type Cell = null | 'X' | 'O';
export type Board = Cell[]; // length 9

export const WIN_LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function checkWinner(board: Board): 'X' | 'O' | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

export function isDraw(board: Board): boolean {
  return board.every(c => c !== null) && !checkWinner(board);
}

export function tttCustomId(msgId: string, index: number): string {
  return `ttt:${msgId}:${index}`;
}

// ── Bot AI ──────────────────────────────────────────────────────────────────
//
// Priority order (the bot never skips a higher-priority action):
//   1. Win immediately  — take any move that wins the game right now.
//   2. Block the player — if the player has an immediate winning move, block it.
//   3. Block a fork     — if the player has two or more ways to win on the next
//                         turn, block one of those fork cells so they can't set
//                         up an unblockable trap.
//   4. Random           — none of the above apply; pick any open cell at random.
//                         This is the only place the bot can look "dumb", which
//                         keeps it genuinely beatable without ever looking stupid.

function openCells(board: Board): number[] {
  return board.reduce<number[]>((acc, c, i) => (c === null ? [...acc, i] : acc), []);
}

/**
 * Returns the index of a cell where `player` can win in one move,
 * or -1 if no such cell exists.
 */
function findWinningMove(board: Board, player: Cell): number {
  for (const [a, b, c] of WIN_LINES) {
    const line = [board[a], board[b], board[c]];
    const empties = [a, b, c].filter(i => board[i] === null);
    const filled  = line.filter(v => v === player);
    if (filled.length === 2 && empties.length === 1) return empties[0];
  }
  return -1;
}

/**
 * Returns all cells where placing `player` would give them two or more
 * immediate winning threats on the very next move (a "fork").
 */
function findForkCells(board: Board, player: Cell): number[] {
  return openCells(board).filter(cell => {
    board[cell] = player;
    // Count how many winning moves the player would have from here
    const threats = openCells(board).filter(next => {
      board[next] = player;
      const wins = checkWinner(board) === player;
      board[next] = null;
      return wins;
    }).length;
    board[cell] = null;
    return threats >= 2;
  });
}

function randomFrom(cells: number[]): number {
  return cells[Math.floor(Math.random() * cells.length)];
}

export function bestBotMove(board: Board): number {
  const open = openCells(board);
  if (open.length === 0) return -1;

  // 1. Win immediately
  const winMove = findWinningMove(board, 'O');
  if (winMove !== -1) return winMove;

  // 2. Block the player's immediate win
  const blockMove = findWinningMove(board, 'X');
  if (blockMove !== -1) return blockMove;

  // 3. Block a player fork (pick one at random so it's not always predictable)
  const forks = findForkCells(board, 'X');
  if (forks.length > 0) return randomFrom(forks);

  // 4. Anything else — fully random so the bot can actually lose
  return randomFrom(open);
}

// ── Payload builder ─────────────────────────────────────────────────────────

export function buildTicTacToePayload(opts: {
  msgId:      string;
  board:      Board;
  turnName:   string;
  p1Name:     string;
  p2Name:     string;
  status?:    string;  // overrides the "turn" line when the game has ended
  disabled?:  boolean;
}): any {
  const { msgId, board, turnName, p1Name, p2Name, status, disabled = false } = opts;

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let c = 0; c < 3; c++) {
      const i   = r * 3 + c;
      const val = board[i];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(tttCustomId(msgId, i))
          .setLabel(val ?? '\u200b')
          .setStyle(
            val === 'X' ? ButtonStyle.Danger
            : val === 'O' ? ButtonStyle.Success
            : ButtonStyle.Secondary,
          )
          .setDisabled(disabled || val !== null),
      );
    }
    rows.push(row);
  }

  const statusLine = status ?? `**${turnName}**'s turn.`;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blade ?? '🎮'} Tic Tac Toe`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**X** — ${p1Name}  vs  **O** — ${p2Name}\n${statusLine}`),
    );

  for (const row of rows) container.addActionRowComponents(row);

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
