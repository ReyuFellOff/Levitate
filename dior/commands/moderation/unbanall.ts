import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  buildUnbanAllCompletePayload,
  buildUnbanAllConfirmPayload,
  buildUnbanAllWorkingPayload,
  buildUnbanAllCancelledPayload,
  buildUnbanAllTimedOutPayload,
} from '../../components/moderation/unbanall.js';

export const options = {
  name: 'unbanall',
  aliases: ['unban-all'] as string[],
  description: 'Unban every banned user from this server after confirmation.',
  usage: 'unbanall',
  category: 'moderation',
  owner: false,
  cooldown: 10,
};

async function runUnbanAll(guild: any, moderator: string): Promise<{ total: number; success: number }> {
  const bans = await guild.bans.fetch();
  const entries = [...bans.values()];
  let success = 0;
  for (const ban of entries) {
    const ok = await guild.bans.remove(ban.user.id, `Unban all by ${moderator}`).then(() => true).catch((error: any) => {
      console.error(`[unbanall] failed to unban ${ban.user.id}: ${error?.message ?? error}`);
      return false;
    });
    if (ok) success++;
    if (entries.indexOf(ban) < entries.length - 1) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { total: entries.length, success };
}

async function startUnbanAll(message: any, guild: any, client: CassieClient): Promise<void> {
  const bans = await guild.bans.fetch().catch((): null => null);
  if (!bans?.size) {
    await sendError({ message }, 'There are no banned users in this server.');
    return;
  }

  const confirmId = `unbanall:confirm:${message.id}`;
  const cancelId = `unbanall:cancel:${message.id}`;
  const prompt = await message.channel.send(buildUnbanAllConfirmPayload(confirmId, cancelId, bans.size)).catch((): null => null);
  if (!prompt) return;

  const collector = prompt.createMessageComponentCollector({
    filter: (interaction: any) => authorOnlyFilter(interaction, message.author.id, (id) => id === confirmId || id === cancelId),
    max: 1,
    time: 60_000,
  });

  collector.on('collect', async (interaction: any) => {
    await interaction.deferUpdate().catch((): null => null);
    if (interaction.customId === cancelId) {
      await prompt.edit(buildUnbanAllCancelledPayload()).catch((): null => null);
      return;
    }

    await prompt.edit(buildUnbanAllWorkingPayload(bans.size)).catch((): null => null);
    const result = await runUnbanAll(guild, message.author.tag ?? message.author.username);
    await prompt.edit(buildUnbanAllCompletePayload(result.total, result.success)).catch((): null => null);
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason === 'time') prompt.edit(buildUnbanAllTimedOutPayload()).catch((): null => null);
  });
}

export async function prefixExecute(message: any, _args: string[], client: CassieClient): Promise<void> {
  const guild = message.guild;
  if (!guild) { await sendError({ message }, 'This command can only be used in a server.'); return; }
  const invoker = message.channel.permissionsFor?.(message.member);
  if (!invoker?.has?.(PermissionFlagsBits.BanMembers)) { await sendError({ message }, 'You need the **Ban Members** permission to use this command.'); return; }
  const bot = guild.members.me;
  if (!bot?.permissions?.has?.(PermissionFlagsBits.BanMembers)) { await sendError({ message }, 'I need the **Ban Members** permission to unban users.'); return; }
  await startUnbanAll(message, guild, client);
}

export async function slashExecute(interaction: any, _client: CassieClient): Promise<void> {
  await interaction.deferReply();
  const guild = interaction.guild;
  if (!guild) { await interaction.editReply({ content: 'This command can only be used in a server.' }); return; }
  if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.BanMembers)) { await interaction.editReply({ content: 'You need the **Ban Members** permission to use this command.' }); return; }
  const bot = guild.members.me;
  if (!bot?.permissions?.has?.(PermissionFlagsBits.BanMembers)) { await interaction.editReply({ content: 'I need the **Ban Members** permission to unban users.' }); return; }

  const bans = await guild.bans.fetch().catch((): null => null);
  if (!bans?.size) { await interaction.editReply({ content: 'There are no banned users in this server.' }); return; }
  const confirmId = `unbanall:confirm:${interaction.id}`;
  const cancelId = `unbanall:cancel:${interaction.id}`;
  await interaction.editReply(buildUnbanAllConfirmPayload(confirmId, cancelId, bans.size));
  const prompt = await interaction.fetchReply().catch((): null => null);
  if (!prompt) return;
  const collector = prompt.createMessageComponentCollector({ filter: (i: any) => authorOnlyFilter(i, interaction.user.id, (id) => id === confirmId || id === cancelId), max: 1, time: 60_000 });
  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === cancelId) { await prompt.edit(buildUnbanAllCancelledPayload()).catch((): null => null); return; }
    await prompt.edit(buildUnbanAllWorkingPayload(bans.size)).catch((): null => null);
    const result = await runUnbanAll(guild, interaction.user.tag ?? interaction.user.username);
    await prompt.edit(buildUnbanAllCompletePayload(result.total, result.success)).catch((): null => null);
  });
  collector.on('end', (_: any, reason: string) => { if (reason === 'time') prompt.edit(buildUnbanAllTimedOutPayload()).catch((): null => null); });
}
