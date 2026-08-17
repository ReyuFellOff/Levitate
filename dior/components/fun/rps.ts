// xoxo/components/fun/rps.ts
//
// CV2 payload builders + session manager for $rps (rock paper scissors).
//
// Solo mode  — the invoker plays against the bot.
// PvP mode   — the invoker challenges another user. The challenged user gets
//              Accept / Decline buttons. If they accept, the challenger picks
//              first (move stored but not revealed), then the opponent picks,
//              then both moves are revealed together.
//
// Sessions are keyed by scopeId (the invoking message ID). All interactions
// are routed through the global interactionCreate handler (no message collectors)
// so every button click is always acknowledged — no "interaction failed".
//
// Session timeout: 2 minutes of inactivity → components disabled.

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

// ── Types ─────────────────────────────────────────────────────────────────────

export type RpsChoice = 'rock' | 'paper' | 'scissors';

export type RpsState =
  | 'pending_accept'    // pvp: waiting for opponent to accept
  | 'picking'           // solo: waiting for author; pvp: waiting for challenger
  | 'opponent_picking'  // pvp: challenger picked, waiting for opponent
  | 'done';             // result shown, restart button active

export interface RpsSession {
  mode:              'solo' | 'pvp';
  state:             RpsState;
  authorId:          string;
  authorName:        string;
  opponentId?:       string;    // pvp only
  opponentName?:     string;    // pvp only
  challengerPick?:   RpsChoice; // pvp: stored until opponent picks
  botName:           string;
  guildId:           string;
  channelId:         string;
  botMsgId:          string;    // the bot's message ID (set after send)
  client:            any;       // LevitateClient — used by timeout cleanup
}

// ── Session store ─────────────────────────────────────────────────────────────

const TIMEOUT_MS = 2 * 60_000; // 2 minutes

const sessions = new Map<string, RpsSession>();
const timeouts = new Map<string, NodeJS.Timeout>();

export function registerRpsSession(scopeId: string, session: RpsSession): void {
  sessions.set(scopeId, session);
  resetRpsTimeout(scopeId);
}

export function getRpsSession(scopeId: string): RpsSession | undefined {
  return sessions.get(scopeId);
}

export function clearRpsSession(scopeId: string): void {
  clearTimeout(timeouts.get(scopeId));
  sessions.delete(scopeId);
  timeouts.delete(scopeId);
}

export function resetRpsTimeout(scopeId: string): void {
  clearTimeout(timeouts.get(scopeId));
  const s = sessions.get(scopeId);
  if (!s) return;

  timeouts.set(scopeId, setTimeout(async () => {
    const s = sessions.get(scopeId);
    sessions.delete(scopeId);
    timeouts.delete(scopeId);
    if (!s) return;

    // Disable the active components so the message looks expired
    let disabledPayload: any;
    if (s.mode === 'solo') {
      disabledPayload = s.state === 'picking'
        ? buildSoloTimedOutPayload(scopeId, s.authorName)
        : buildSoloPickPayload(scopeId, s.authorName, true); // 'done' state: disable restart
    } else {
      // pvp states
      if (s.state === 'pending_accept') {
        disabledPayload = buildChallengeExpiredPayload(s.authorName);
      } else if (s.state === 'picking') {
        disabledPayload = buildPvpChallengerPickPayload(scopeId, s.authorName, s.opponentName!, true);
      } else if (s.state === 'opponent_picking') {
        disabledPayload = buildPvpOpponentPickPayload(scopeId, s.authorName, s.opponentName!, true);
      }
    }

    if (!disabledPayload) return;

    try {
      const ch  = await (s.client as any).channels.fetch(s.channelId);
      const msg = await ch.messages.fetch(s.botMsgId);
      await msg.edit(disabledPayload);
    } catch { /* message may have been deleted */ }
  }, TIMEOUT_MS));
}

// ── Lookup data ───────────────────────────────────────────────────────────────

export const RPS_CHOICES: { key: RpsChoice; label: string; emoji: string }[] = [
  { key: 'rock',     label: 'Rock',     emoji: '🪨' },
  { key: 'paper',    label: 'Paper',    emoji: '📄' },
  { key: 'scissors', label: 'Scissors', emoji: '✂️' },
];

// ── Custom ID helpers ─────────────────────────────────────────────────────────

/** e.g. rps:pick:rock:<scopeId> */
export function rpsPickId(scopeId: string, choice: RpsChoice): string {
  return `rps:pick:${choice}:${scopeId}`;
}
export function rpsRestartId(scopeId: string): string {
  return `rps:restart:${scopeId}`;
}
export function rpsAcceptId(scopeId: string): string {
  return `rps:accept:${scopeId}`;
}
export function rpsDeclineId(scopeId: string): string {
  return `rps:decline:${scopeId}`;
}

/** Parse a customId like "rps:pick:rock:<scopeId>" → { action, param, scopeId } */
export function parseRpsId(customId: string): { action: string; param: string; scopeId: string } | null {
  const parts = customId.split(':');
  if (parts[0] !== 'rps' || parts.length < 3) return null;
  // rps:pick:rock:<scopeId>  → action=pick  param=rock  scopeId=parts[3]
  // rps:restart:<scopeId>   → action=restart param=''  scopeId=parts[2]
  // rps:accept:<scopeId>    → action=accept  param=''  scopeId=parts[2]
  // rps:decline:<scopeId>   → action=decline param=''  scopeId=parts[2]
  if (parts[1] === 'pick' && parts.length >= 4) {
    return { action: 'pick', param: parts[2] as RpsChoice, scopeId: parts.slice(3).join(':') };
  }
  return { action: parts[1], param: '', scopeId: parts.slice(2).join(':') };
}

// ── Game logic ────────────────────────────────────────────────────────────────

export function resolveRps(user: RpsChoice, bot: RpsChoice): 'win' | 'lose' | 'tie' {
  if (user === bot) return 'tie';
  const beats: Record<RpsChoice, RpsChoice> = {
    rock:     'scissors',
    paper:    'rock',
    scissors: 'paper',
  };
  return beats[user] === bot ? 'win' : 'lose';
}

function choiceMeta(c: RpsChoice) {
  return RPS_CHOICES.find(x => x.key === c)!;
}

// ── CV2 helpers ───────────────────────────────────────────────────────────────

const HEADER = `## ${emojis.blade ?? '⚔️'} Rock Paper Scissors`;

function wrap(container: ContainerBuilder): any {
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

function base(): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(HEADER))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
}

function pickRow(scopeId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    RPS_CHOICES.map(c =>
      new ButtonBuilder()
        .setCustomId(rpsPickId(scopeId, c.key))
        .setLabel(c.label)
        .setEmoji(c.emoji)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  );
}

// ── Payload builders ──────────────────────────────────────────────────────────

/** Solo: initial pick prompt. */
export function buildSoloPickPayload(scopeId: string, username: string, disabled = false): any {
  return wrap(
    base()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${username}**, pick your move.`))
      .addActionRowComponents(pickRow(scopeId, disabled)),
  );
}

/** Solo or PvP: result panel. */
export function buildResultPayload(opts: {
  scopeId:      string;
  leftName:     string;
  leftPick:     RpsChoice;
  rightName:    string;
  rightPick:    RpsChoice;
  outcome:      'win' | 'lose' | 'tie'; // from leftName's perspective
  disabled?:    boolean;
  showRestart?: boolean;
}): any {
  const { scopeId, leftName, leftPick, rightName, rightPick, outcome, disabled = false, showRestart = true } = opts;
  const lm = choiceMeta(leftPick);
  const rm = choiceMeta(rightPick);

  let resultLine: string;
  if (outcome === 'tie')       resultLine = `### It's a tie!`;
  else if (outcome === 'win')  resultLine = `### **${leftName}** wins! **${rightName}** loses.`;
  else                         resultLine = `### **${rightName}** wins! **${leftName}** loses.`;

  const c = base()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**${leftName}** picked ${lm.emoji} **${lm.label}**\n` +
      `**${rightName}** picked ${rm.emoji} **${rm.label}**`,
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(resultLine));

  if (showRestart) {
    c.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(rpsRestartId(scopeId))
          .setLabel('Play Again')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
      ),
    );
  }

  return wrap(c);
}

/** Solo: timed out before picking. */
export function buildSoloTimedOutPayload(scopeId: string, username: string): any {
  return wrap(
    base()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${username}** didn't pick in time.`))
      .addActionRowComponents(pickRow(scopeId, true)),
  );
}

// ── PvP payloads ──────────────────────────────────────────────────────────────

/** PvP: challenge prompt sent after invoking $rps @user. */
export function buildChallengePayload(
  scopeId:        string,
  challengerName: string,
  opponentMention: string,
  disabled = false,
): any {
  return wrap(
    base()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**${challengerName}** challenges ${opponentMention} to a game!\n` +
        `${opponentMention}, do you accept?`,
      ))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(rpsAcceptId(scopeId))
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId(rpsDeclineId(scopeId))
            .setLabel('Decline')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
        ),
      ),
  );
}

/** PvP: challenge was declined. */
export function buildDeclinedPayload(challengerName: string, opponentName: string): any {
  return wrap(
    base().addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**${opponentName}** declined the challenge from **${challengerName}**.`,
    )),
  );
}

/** PvP: challenge expired (nobody accepted). */
export function buildChallengeExpiredPayload(challengerName: string): any {
  return wrap(
    base()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**${challengerName}**'s challenge timed out — nobody accepted.`,
      ))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('rps:noop')
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('rps:noop2')
            .setLabel('Decline')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
        ),
      ),
  );
}

/** PvP: challenger's turn to pick (after opponent accepted). */
export function buildPvpChallengerPickPayload(scopeId: string, challengerName: string, opponentName: string, disabled = false): any {
  return wrap(
    base()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**${opponentName}** accepted! It's on.\n\n` +
        `**${challengerName}**, you go first — pick your move.`,
      ))
      .addActionRowComponents(pickRow(scopeId, disabled)),
  );
}

/** PvP: challenger has picked (hidden), now waiting for opponent. */
export function buildPvpOpponentPickPayload(scopeId: string, challengerName: string, opponentName: string, disabled = false): any {
  return wrap(
    base()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**${challengerName}** has picked — waiting for **${opponentName}**.\n\n` +
        `**${opponentName}**, pick your move.`,
      ))
      .addActionRowComponents(pickRow(scopeId, disabled)),
  );
}
