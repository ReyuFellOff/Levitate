import { config } from '../../config.js';
// xoxo/components/botActionConfirm.ts
//
// Generic confirmation prompt used by both `restart-bot` and `stop-bot`.
// The verb (`"restart"` / `"stop"`) is parameterised so the same payload
// builders cover both flows.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';

function buildPayload(
  action: string,
  confirmId: string,
  cancelId: string,
  activeRequests: number,
  disabled: boolean,
  footer?: string,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Are you sure you want to ${action} the bot?`,
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `- **Active requests:** ${activeRequests}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(confirmId)
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(cancelId)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
      ),
    );

  if (footer) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footer),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

/** Active prompt with live buttons. */
export function buildBotActionConfirmPayload(
  action: string,
  confirmId: string,
  cancelId: string,
  activeRequests: number,
  footer?: string,
): any {
  return buildPayload(action, confirmId, cancelId, activeRequests, false, footer);
}

/** Timed-out state — buttons disabled. */
export function buildBotActionTimedOutPayload(
  action: string,
  confirmId: string,
  cancelId: string,
  activeRequests: number,
): any {
  return buildPayload(action, confirmId, cancelId, activeRequests, true, '-# Confirmation timed out.');
}
