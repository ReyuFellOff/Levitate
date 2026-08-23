import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { buildReminderListPayload } from '../../components/utility/reminder.js';
import {
  createReminder,
  deleteReminder,
  listReminders,
  MAX_REMINDER_MS,
} from '../../helpers/reminderStore.js';
import { parseDuration, formatDuration } from '../../helpers/parseDuration.js';

export const options = {
  name: 'remind',
  aliases: ['remindme'] as string[],
  description: 'Create and manage personal reminders.',
  usage: 'remind <duration> <reason>\nremind list\nremind delete <number>',
  category: 'utility',
  owner: false,
  cooldown: 3,
};

function findDuration(args: string[]): { delayMs: number; reason: string } | null {
  for (let end = 1; end <= Math.min(args.length, 3); end++) {
    const durationText = args.slice(0, end).join(' ');
    const delayMs = parseDuration(durationText);
    if (delayMs !== null) return { delayMs, reason: args.slice(end).join(' ').trim() };
  }
  return null;
}

async function sendList(message: any, client: LevitateClient): Promise<void> {
  const reminders = await listReminders(client, message.author.id);
  await message.channel.send(buildReminderListPayload(reminders, message.author.id));
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient): Promise<any> {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');

  const action = args[0]?.toLowerCase();
  if (action === 'list') return sendList(message, client);

  if (action === 'delete' || action === 'remove') {
    const number = Number(args[1]);
    if (!Number.isInteger(number) || number < 1 || args.length !== 2)
      return sendError({ message }, `Usage: \`${client.config.prefix}remind delete <number>\``);
    const deleted = await deleteReminder(client, message.author.id, number);
    if (!deleted) return sendError({ message }, 'No reminder exists with that number.');
    return sendSuccess({ message }, `Reminder **${number}** deleted.`);
  }

  const parsed = findDuration(args);
  if (!parsed || !parsed.reason) {
    return sendError({ message }, `Usage: \`${client.config.prefix}${options.usage.split('\n')[0]}\``);
  }
  if (parsed.delayMs > MAX_REMINDER_MS) {
    return sendError({ message }, 'A reminder cannot be set for more than 2 years.');
  }

  const reminder = await createReminder(client, message.author.id, message.channel.id, parsed.delayMs, parsed.reason)
    .catch((error: Error) => ({ error }));
  if ('error' in reminder) return sendError({ message }, reminder.error.message);

  return sendSuccess({ message }, `Reminder set for **${formatDuration(parsed.delayMs)}**. ${reminder.reason}`);
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();
  const action = interaction.options.getSubcommand(false);

  if (action === 'list') {
    const reminders = await listReminders(client, interaction.user.id);
    return interaction.editReply(buildReminderListPayload(reminders, interaction.user.id));
  }
  if (action === 'delete') {
    const number = interaction.options.getInteger('number', true);
    const deleted = await deleteReminder(client, interaction.user.id, number);
    return interaction.editReply(deleted
      ? { content: `Reminder **${number}** deleted.` }
      : { content: 'No reminder exists with that number.' });
  }

  const delayMs = parseDuration(interaction.options.getString('duration', true));
  const reason = interaction.options.getString('reason', true).trim();
  if (delayMs === null) return interaction.editReply({ content: 'Invalid duration.' });
  if (delayMs > MAX_REMINDER_MS) return interaction.editReply({ content: 'A reminder cannot be set for more than 2 years.' });

  const reminder = await createReminder(client, interaction.user.id, interaction.channelId, delayMs, reason)
    .catch((error: Error) => ({ error }));
  if ('error' in reminder) return interaction.editReply({ content: reminder.error.message });
  return interaction.editReply({ content: `Reminder set for **${formatDuration(delayMs)}**. ${reason}` });
}
