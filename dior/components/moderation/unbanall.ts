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

const NO_MENTIONS = { parse: [] as any[] };

function panel(title: string, body: string, color = 0xF5CBCB): any {
  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_MENTIONS };
}

export function buildUnbanAllConfirmPayload(confirmId: string, cancelId: string, count: number): any {
  const container = new ContainerBuilder()
    .setAccentColor(0xF5CBCB)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Unban All'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `Are you sure you want to unban **all ${count} banned users**?\n-# This action cannot be undone.`,
    ))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel('Unban All').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      ),
    );
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_MENTIONS };
}

export function buildUnbanAllWorkingPayload(count: number): any {
  return panel('Unban All - Working', `Unbanning **${count}** users...`);
}

export function buildUnbanAllCancelledPayload(): any {
  return panel('Unban All Cancelled', 'No users were unbanned.');
}

export function buildUnbanAllTimedOutPayload(): any {
  return panel('Unban All Timed Out', 'No users were unbanned.');
}

export function buildUnbanAllCompletePayload(total: number, success: number): any {
  return panel(
    `${emojis.greentick} Unban All Complete`,
    `Successfully unbanned **${success}** of **${total}** users.`,
    success === total ? 0xB4F8C8 : 0xF5CBCB,
  );
}
