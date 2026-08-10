// xoxo/components/moderation/roleAll.ts
//
// CV2 payload builders for the $roleall command's target-type selection panel
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

export type RoleAllTargetType = 'all' | 'humans' | 'bots';

function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

/**
 * Panel asking the user who to give the role to.
 * Buttons use `roleall:<type>:<token>` pattern so the per-message collector can filter.
 */
export function buildRoleAllTargetPanel(
  roleName: string,
  roleId: string,
  memberCount: number,
  token: string,
): any {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Role Assignment — <@&${roleId}>\n` +
        `-# Who should receive **@${roleName}**? Choose a target group below.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Server has approximately **${memberCount.toLocaleString()}** members. ` +
        `Members who already have the role will be skipped automatically.`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`roleall:all:${token}`)
          .setLabel('All Members')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`roleall:humans:${token}`)
          .setLabel('Humans Only')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`roleall:bots:${token}`)
          .setLabel('Bots Only')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`roleall:cancel:${token}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger),
      ),
    );

  return wrap(container);
}

/** Shown while members are being fetched and the role is being applied. */
export function buildRoleAllProgressPayload(roleName: string, targetType: RoleAllTargetType): any {
  const targetLabel = targetType === 'all' ? 'all members' : targetType === 'humans' ? 'humans' : 'bots';
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Role Assignment in Progress\n` +
        `-# Giving **@${roleName}** to ${targetLabel}. This may take a moment on large servers — please wait.`,
      ),
    );
  return wrap(container);
}

/** Final result panel after role assignment completes. */
export function buildRoleAllResultPayload(
  roleName: string,
  roleId: string,
  targetType: RoleAllTargetType,
  added: number,
  skipped: number,
  failed: number,
  usingCache: boolean,
): any {
  const targetLabel = targetType === 'all' ? 'all members' : targetType === 'humans' ? 'humans only' : 'bots only';

  const lines: string[] = [
    `Gave <@&${roleId}> to **${added}** member${added !== 1 ? 's' : ''}.`,
  ];
  if (skipped > 0) lines.push(`**${skipped}** already had the role.`);
  if (failed > 0) lines.push(`**${failed}** failed (role too high or permission error).`);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Role Assignment Complete\n-# Target: ${targetLabel}`,
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

export function buildRoleAllTimedOutPayload(): any {
  return wrap(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Role assignment panel timed out. No changes were made.'),
    ),
  );
}

export function buildRoleAllCancelledPayload(): any {
  return wrap(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Role assignment cancelled. No changes were made.'),
    ),
  );
}
