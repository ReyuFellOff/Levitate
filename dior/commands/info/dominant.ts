import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildDominantPayload, type ColorDetails } from '../../components/info/dominant.js';
import { getDominantColor } from '../../helpers/dominantColor.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name: 'dominant',
  aliases: [] as string[],
  description: "Show the dominant color of a user's avatar, the server icon, or the bot avatar.",
  usage: `dominant [user]
dominant server
dominant bot`,
  category: 'info',
  owner: false,
  cooldown: 5,
};

async function fetchColorDetails(hex: string): Promise<ColorDetails | null> {
  try {
    const response = await fetch(`https://api.popcat.xyz/v2/color/${encodeURIComponent(hex.replace(/^#/, ''))}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { error?: boolean; message?: ColorDetails };
    return data.error || !data.message ? null : data.message;
  } catch {
    return null;
  }
}

async function buildDominantResponse(label: string, imageUrl: string | null): Promise<any> {
  const color = await getDominantColor(imageUrl);
  const hex = color?.hex ?? '#000000';
  const details = await fetchColorDetails(hex);
  return buildDominantPayload(label, color, imageUrl, details);
}

export async function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');
  const target = args.join(' ').trim() || '__author__';

  if (target.toLowerCase() === 'server') {
    const imageUrl = message.guild.iconURL?.({ size: 4096, extension: 'png' }) ?? null;
    return message.channel.send(await buildDominantResponse(`**Server:** ${message.guild.name}`, imageUrl));
  }

  const user = target.toLowerCase() === 'bot'
    ? client.user
    : target === '__author__'
      ? message.author
      : await resolveUser(client, message.guild, target);
  if (!user) return sendError(ctx, 'User not found. Try a mention, user ID, or username.');

  const imageUrl = user.displayAvatarURL({ size: 4096, extension: 'png' });
  return message.channel.send(await buildDominantResponse(`**User:** <@${user.id}>`, imageUrl));
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };
  const target = interaction.options.getString('target', false)?.trim() || '__author__';
  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (target.toLowerCase() === 'server') {
    const imageUrl = interaction.guild.iconURL?.({ size: 4096, extension: 'png' }) ?? null;
    return interaction.editReply(await buildDominantResponse(`**Server:** ${interaction.guild.name}`, imageUrl));
  }

  const user = target.toLowerCase() === 'bot'
    ? client.user
    : target === '__author__'
      ? interaction.user
      : await resolveUser(client, interaction.guild, target);
  if (!user) return sendError(ctx, 'User not found. Try a mention, user ID, or username.');

  const imageUrl = user.displayAvatarURL({ size: 4096, extension: 'png' });
  return interaction.editReply(await buildDominantResponse(`**User:** <@${user.id}>`, imageUrl));
}
