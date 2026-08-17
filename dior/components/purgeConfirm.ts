// xoxo/components/purgeConfirm.ts
//
// CV2 payload builders for confirmation prompts.
// Exports both purge-specific variants (fixed title) and generic variants
// (caller supplies title) for use by massnick, masskick, role all, etc.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';

// ─────────────────────────────────────────────────────────────────────────────
// Core builder (shared by all variants)
// ─────────────────────────────────────────────────────────────────────────────

function buildBase(
  confirmId:   string,
  cancelId:    string,
  title:       string,
  description: string,
  note:        string,
  disabled:    boolean,
): any {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(title),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(description),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(confirmId)
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(cancelId)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(note),
    );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Purge-specific exports (keep existing callers unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export function buildPurgeConfirmPayload(confirmId: string, cancelId: string, description: string): any {
  return buildBase(confirmId, cancelId, '## Confirm Purge', description, '-# You have 30 seconds to confirm.', false);
}

export function buildPurgeTimedOutPayload(confirmId: string, cancelId: string, description: string): any {
  return buildBase(confirmId, cancelId, '## Confirm Purge', description, '-# Confirmation timed out.', true);
}

export function buildPurgeCancelledPayload(confirmId: string, cancelId: string, description: string): any {
  return buildBase(confirmId, cancelId, '## Confirm Purge', description, '-# Purge cancelled.', true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic action exports (caller supplies title string)
// ─────────────────────────────────────────────────────────────────────────────

export function buildActionConfirmPayload(confirmId: string, cancelId: string, title: string, description: string): any {
  return buildBase(confirmId, cancelId, `## ${title}`, description, '-# You have 30 seconds to confirm.', false);
}

export function buildActionTimedOutPayload(confirmId: string, cancelId: string, title: string, description: string): any {
  return buildBase(confirmId, cancelId, `## ${title}`, description, '-# Confirmation timed out.', true);
}

export function buildActionCancelledPayload(confirmId: string, cancelId: string, title: string, description: string): any {
  return buildBase(confirmId, cancelId, `## ${title}`, description, '-# Action cancelled.', true);
}
