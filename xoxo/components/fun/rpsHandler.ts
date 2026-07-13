// xoxo/components/fun/rpsHandler.ts
//
// Global interaction handler for all rps:* button interactions.
// Imported by interactionCreate.ts.

import { MessageFlags } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import {
  RPS_CHOICES,
  type RpsChoice,
  getRpsSession,
  clearRpsSession,
  resetRpsTimeout,
  parseRpsId,
  buildSoloPickPayload,
  buildResultPayload,
  buildDeclinedPayload,
  buildPvpChallengerPickPayload,
  buildPvpOpponentPickPayload,
} from './rps.js';

function randomChoice(): RpsChoice {
  return RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)].key;
}

function resolveRps(user: RpsChoice, bot: RpsChoice): 'win' | 'lose' | 'tie' {
  if (user === bot) return 'tie';
  const beats: Record<RpsChoice, RpsChoice> = {
    rock: 'scissors', paper: 'rock', scissors: 'paper',
  };
  return beats[user] === bot ? 'win' : 'lose';
}

export async function handleRpsInteraction(interaction: any, _client: LevitateClient): Promise<void> {
  const parsed = parseRpsId(interaction.customId as string);
  if (!parsed) {
    await interaction.reply({ content: 'Unknown RPS action.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }

  const { action, param, scopeId } = parsed;

  // noop buttons (disabled expired buttons) — just acknowledge silently
  if (action === 'noop') {
    await interaction.deferUpdate().catch((): null => null);
    return;
  }

  const session = getRpsSession(scopeId);
  if (!session) {
    await interaction.reply({
      content: 'This game has expired. Start a new one with `$rps`.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  // ── Handle restart (any mode) ─────────────────────────────────────────────
  if (action === 'restart') {
    if (interaction.user.id !== session.authorId) {
      await interaction.reply({ content: "Only the person who started the game can restart it.", flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }

    // Reset to a fresh solo pick phase
    session.state          = 'picking';
    session.challengerPick = undefined;
    resetRpsTimeout(scopeId);
    await interaction.update(buildSoloPickPayload(scopeId, session.authorName)).catch((): null => null);
    return;
  }

  // ── PvP: accept / decline ─────────────────────────────────────────────────
  if (action === 'accept') {
    if (interaction.user.id !== session.opponentId) {
      await interaction.reply({ content: "This challenge isn't for you.", flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }
    if (session.state !== 'pending_accept') {
      await interaction.deferUpdate().catch((): null => null);
      return;
    }

    session.state = 'picking';
    resetRpsTimeout(scopeId);
    await interaction.update(
      buildPvpChallengerPickPayload(scopeId, session.authorName, session.opponentName!),
    ).catch((): null => null);
    return;
  }

  if (action === 'decline') {
    if (interaction.user.id !== session.opponentId) {
      await interaction.reply({ content: "This challenge isn't for you.", flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }
    if (session.state !== 'pending_accept') {
      await interaction.deferUpdate().catch((): null => null);
      return;
    }

    clearRpsSession(scopeId);
    await interaction.update(buildDeclinedPayload(session.authorName, session.opponentName!)).catch((): null => null);
    return;
  }

  // ── Pick ──────────────────────────────────────────────────────────────────
  if (action === 'pick') {
    const choice = param as RpsChoice;
    if (!RPS_CHOICES.some(c => c.key === choice)) {
      await interaction.deferUpdate().catch((): null => null);
      return;
    }

    // ── Solo pick ────────────────────────────────────────────────────────────
    if (session.mode === 'solo') {
      if (interaction.user.id !== session.authorId) {
        await interaction.reply({ content: "This isn't your game.", flags: MessageFlags.Ephemeral }).catch((): null => null);
        return;
      }
      if (session.state !== 'picking') {
        await interaction.deferUpdate().catch((): null => null);
        return;
      }

      const botPick    = randomChoice();
      const outcome    = resolveRps(choice, botPick);
      session.state    = 'done';
      resetRpsTimeout(scopeId);

      await interaction.update(buildResultPayload({
        scopeId,
        leftName:  session.authorName,
        leftPick:  choice,
        rightName: session.botName,
        rightPick: botPick,
        outcome,
        showRestart: true,
      })).catch((): null => null);
      return;
    }

    // ── PvP pick ─────────────────────────────────────────────────────────────
    if (session.mode === 'pvp') {
      // State: picking → challenger's turn
      if (session.state === 'picking') {
        if (interaction.user.id !== session.authorId) {
          await interaction.reply({ content: "It's not your turn yet — wait for the challenger to pick first.", flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        session.challengerPick = choice;
        session.state          = 'opponent_picking';
        resetRpsTimeout(scopeId);

        await interaction.update(
          buildPvpOpponentPickPayload(scopeId, session.authorName, session.opponentName!),
        ).catch((): null => null);
        return;
      }

      // State: opponent_picking → opponent's turn
      if (session.state === 'opponent_picking') {
        if (interaction.user.id !== session.opponentId) {
          await interaction.reply({ content: "It's not your turn — the opponent is still picking.", flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        const challengerPick = session.challengerPick!;
        const opponentPick   = choice;
        const outcomeForChallenger = resolveRps(challengerPick, opponentPick);
        // Flip for opponent's perspective when building result text
        const outcomeForDisplay    = outcomeForChallenger; // displayed from challenger's POV

        clearRpsSession(scopeId);

        await interaction.update(buildResultPayload({
          scopeId,
          leftName:    session.authorName,
          leftPick:    challengerPick,
          rightName:   session.opponentName!,
          rightPick:   opponentPick,
          outcome:     outcomeForDisplay,
          showRestart: false, // PvP games don't auto-restart
        })).catch((): null => null);
        return;
      }

      await interaction.deferUpdate().catch((): null => null);
      return;
    }
  }

  // Fallthrough — unknown action, just acknowledge
  await interaction.deferUpdate().catch((): null => null);
}
