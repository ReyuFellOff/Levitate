// xoxo/components/moderation/massnick.ts
//
// CV2 payload builders for the $massnick command's target-type selection panel
// and result panel.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';

export type MassNickTargetType = 'all' | 'humans' | 'bots';
export type MassNickMode = 'prepend' | 'prefix' | 'append' | 'suffix' | 'reset' | 'remove';

function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function modeLabel(mode: MassNickMode, word: string | null): string {
  switch (mode) {
    case 'prepend':
    case 'prefix':  return `prepend **\`${word}\`** to nicknames`;
    case 'append':
    case 'suffix':  return `append **\`${word}\`** to nicknames`;
    case 'remove':  return `remove **\`${word}\`** from nicknames`;
    case 'reset':   return 'reset all nicknames';
  }
}

/**
 * Panel asking the user who to apply the mass-nick to.
 * Buttons use `massnick:<type>:<token>` so the per-message collector can filter.
 */
export function buildMassNickTargetPanel(
  mode: MassNickMode,
  word: string | null,
  memberCount: number,
  token: string,
): any {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Mass Nickname — ${modeLabel(mode, word)}\n` +
        `-# Choose who this should apply to.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Server has approximately **${memberCount.toLocaleString()}** members.`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`massnick:all:${token}`)
          .setLabel('All Members')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`massnick:humans:${token}`)
          .setLabel('Humans Only')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`massnick:bots:${token}`)
          .setLabel('Bots Only')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`massnick:cancel:${token}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger),
      ),
    );

  return wrap(container);
}

/** Shown while members are being processed. */
export function buildMassNickProgressPayload(mode: MassNickMode, word: string | null, targetType: MassNickTargetType): any {
  const targetLabel = targetType === 'all' ? 'all members' : targetType === 'humans' ? 'humans' : 'bots';
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Mass Nickname in Progress\n` +
        `-# Applying **${mode}${word ? ` "${word}"` : ''}** to ${targetLabel}. This may take a moment on large servers…`,
      ),
    );
  return wrap(container);
}

/** Final result panel after mass-nick completes. */
export function buildMassNickResultPayload(
  mode: MassNickMode,
  word: string | null,
  targetType: MassNickTargetType,
  changed: number,
  skipped: number,
  failed: number,
  usingCache: boolean,
): any {
  const targetLabel = targetType === 'all' ? 'all members' : targetType === 'humans' ? 'humans only' : 'bots only';

  const lines: string[] = [
    `**${changed}** nickname${changed !== 1 ? 's' : ''} updated.`,
  ];
  if (skipped > 0) lines.push(`**${skipped}** skipped (already correct or word not found).`);
  if (failed  > 0) lines.push(`**${failed}** failed (role too high or unmanageable).`);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Mass Nickname Complete\n-# Target: ${targetLabel} · operation: ${mode}${word ? ` "${word}"` : ''}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n')),
    );

  if (usingCache) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# Member list may be incomplete — the Server Members privileged intent is not active in the Discord Developer Portal. Enable it for full coverage.`,
        ),
      );
  }

  return wrap(container);
}

export function buildMassNickTimedOutPayload(): any {
  return wrap(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Mass nickname panel timed out. No changes were made.'),
    ),
  );
}

export function buildMassNickCancelledPayload(): any {
  return wrap(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Mass nickname cancelled. No changes were made.'),
    ),
  );
}
