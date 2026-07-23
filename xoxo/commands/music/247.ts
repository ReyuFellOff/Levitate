// xoxo/commands/music/247.ts
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess, sendInfo } from '../../components/statusMessages.js';
import { clearRejoin } from '../../helpers/twentyFourSeven.js';

export const options = {
  name: '247',
  aliases: ['twentyfourseven', 'stay'] as string[],
  description: 'Manage 24/7 mode. Subcommands: enable, disable, view.',
  usage: '247 <enable|disable|view> [#channel]',
  category: 'music',
  isDeveloper: false,
  userPerms: ['ManageGuild'] as string[],
  botPerms: [] as string[],
  player: false,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  cooldown: 5,
};

async function handleEnable(
  ctx: { message?: any; interaction?: any; isSlash: boolean },
  guild: any,
  channelId: string | null,
  client: LevitateClient,
): Promise<any> {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };

  const resolvedChannelId =
    channelId ?? guild.members.me?.voice?.channelId ?? null;

  if (!resolvedChannelId) {
    return sendError(ctxObj, 'Please specify a voice channel or join one first.');
  }

  const channel = guild.channels?.cache?.get(resolvedChannelId);
  if (!channel?.isVoiceBased()) {
    return sendError(ctxObj, 'That is not a valid voice channel.');
  }

  await (client as any).db?.set24Seven?.(guild.id, { enabled: true, channelId: resolvedChannelId }).catch((): null => null);

  clearRejoin(guild.id);

  return sendSuccess(ctxObj, `24/7 mode enabled in <#${resolvedChannelId}>. The bot will stay connected even after the queue ends.`);
}

async function handleDisable(
  ctx: { message?: any; interaction?: any; isSlash: boolean },
  guild: any,
  client: LevitateClient,
): Promise<any> {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const current = await (client as any).db?.get24Seven?.(guild.id).catch((): null => null);

  if (!current?.enabled) {
    return sendError(ctxObj, '24/7 mode is not currently enabled.');
  }

  clearRejoin(guild.id);
  await (client as any).db?.clear24Seven?.(guild.id).catch((): null => null);

  return sendSuccess(ctxObj, '24/7 mode has been disabled. The bot will leave normally when the queue ends.');
}

async function handleView(
  ctx: { message?: any; interaction?: any; isSlash: boolean },
  guild: any,
  client: LevitateClient,
): Promise<any> {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const current = await (client as any).db?.get24Seven?.(guild.id).catch((): null => null);

  if (!current?.enabled) {
    return sendInfo(ctxObj, '24/7 mode is not currently enabled in this server.');
  }

  return sendInfo(ctxObj, `24/7 channel is: <#${current.channelId}>`);
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient) {
  const subcommand = args[0]?.toLowerCase();
  const ctx        = { message, isSlash: false };

  if (subcommand === 'enable') {
    const channelMention = message.mentions?.channels?.first();
    await handleEnable(ctx, message.guild, channelMention?.id ?? args[1] ?? null, client);
  } else if (subcommand === 'disable') {
    await handleDisable(ctx, message.guild, client);
  } else if (subcommand === 'view') {
    await handleView(ctx, message.guild, client);
  } else {
    await sendError({ message }, `Invalid subcommand. Usage: \`${options.usage}\``);
  }
}

export async function slashExecute(interaction: any, client: LevitateClient) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  const ctx = { interaction, isSlash: true };

  if (sub === 'enable') {
    const channel = interaction.options.getChannel('channel', false);
    await handleEnable(ctx, interaction.guild, channel?.id ?? null, client);
  } else if (sub === 'disable') {
    await handleDisable(ctx, interaction.guild, client);
  } else if (sub === 'view') {
    await handleView(ctx, interaction.guild, client);
  }
}
