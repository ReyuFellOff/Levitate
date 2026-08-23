import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import { emojis } from '../../emojis.js';
import { reminderRelativeTime, type Reminder } from '../../helpers/reminderStore.js';

export function buildReminderListPayload(reminders: Reminder[], userId: string): any {
  const body = reminders.length
    ? reminders.map((reminder, index) =>
        `**${index + 1}.** ${reminder.reason}\n${reminderRelativeTime(reminder)}`,
      ).join('\n')
    : 'You have no active reminders.';
  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emojis.workingClock} <@${userId}> Reminders`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${reminders.length}/25 active reminders`));
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildReminderCompletePayload(reminder: Reminder): any {
  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `### ${emojis.remindIcon} <@${reminder.userId}> Reminder: ${reminder.reason}`,
    ));
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [reminder.userId] },
  };
}
