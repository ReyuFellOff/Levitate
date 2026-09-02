import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';

export const options = {
  name: 'rename-channel',
  aliases: ['renamechannel'] as string[],
  description: 'Rename a channel.',
  usage: 'rename-channel <#channel | channel ID | channel name> <new name>',
  category: 'channels',
  owner: false,
  cooldown: 3,
};

const MAX_CHANNEL_NAME = 100;

function resolveChannel(guild: any, value: string): any | null {
  const mention = value.match(/^<#(\d+)>$/);
  const id = mention?.[1] ?? (/^\d{17,20}$/.test(value) ? value : null);
  if (id) return guild.channels?.cache?.get(id) ?? null;

  const query = value.toLocaleLowerCase();
  return [...(guild.channels?.cache?.values?.() ?? [])]
    .filter((channel: any) => channel.name?.toLocaleLowerCase() === query)
    .sort((a: any, b: any) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id))[0] ?? null;
}

async function renameChannel(
  ctx: { message?: any; interaction?: any },
  channel: any,
  newName: string,
): Promise<any> {
  const guild = ctx.message?.guild ?? ctx.interaction?.guild;
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch((): null => null);
  if (!channel.permissionsFor?.(botMember)?.has?.(PermissionFlagsBits.ManageChannels)) {
    return sendError(ctx, `I need the **Manage Channels** permission in <#${channel.id}> to rename it.`);
  }

  const oldName = channel.name;
  try {
    await channel.setName(newName, `Channel renamed by ${ctx.message?.author?.username ?? ctx.interaction?.user?.username ?? 'user'}`);
  } catch {
    return sendError(ctx, `I couldn't rename <#${channel.id}>. Discord rejected the change.`);
  }

  return sendSuccess(ctx, `Renamed <#${channel.id}> from **${oldName}** to **${newName}**.`);
}

function validateName(ctx: { message?: any; interaction?: any }, rawName: string): string | null {
  const name = rawName.trim();
  if (!name) {
    sendError(ctx, 'Channel name cannot be empty.');
    return null;
  }
  if (name.length > MAX_CHANNEL_NAME) {
    sendError(ctx, `Channel name is too long (**${name.length}** characters). Maximum is **${MAX_CHANNEL_NAME}**.`);
    return null;
  }
  return name;
}

export async function prefixExecute(
  message: any,
  args: string[],
  _client: CassieClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!message.member?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
    return sendError(ctx, 'You need the **Manage Channels** permission to rename channels.');
  }
  if (args.length < 2) {
    return sendError(ctx, `Usage:\n\`\`\`\n${options.usage}\n\`\`\``);
  }

  const channel = resolveChannel(message.guild, args[0]);
  if (!channel) return sendError(ctx, `Could not find channel \`${args[0]}\`.`);

  const newName = validateName(ctx, args.slice(1).join(' '));
  if (!newName) return;
  return renameChannel(ctx, channel, newName);
}

export async function slashExecute(
  interaction: any,
  _client: CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };
  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageChannels)) {
    return sendError(ctx, 'You need the **Manage Channels** permission to rename channels.');
  }

  const channel = interaction.options.getChannel('channel', true);
  const newName = validateName(ctx, interaction.options.getString('name', true));
  if (!newName) return;
  return renameChannel(ctx, channel, newName);
}
