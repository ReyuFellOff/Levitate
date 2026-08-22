import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { sendImagePanel } from '../../helpers/imagePanel.js';

export const options = {
  name: 'serversplash',
  aliases: ['ssplash'],
  description: "Show this server's invite splash image.",
  usage: 'serversplash',
  category: 'utility',
  owner: false,
  cooldown: 3,
};

export async function prefixExecute(message: any, _args: string[], _client: LevitateClient): Promise<any> {
  const guild = message.guild;
  if (!guild) return sendError({ message }, 'This command can only be used in a server.');

  const imageUrl = guild.splashURL({ size: 4096 });
  if (!imageUrl) return sendError({ message }, 'This server does not have a splash image.');

  return sendImagePanel({
    channel: message.channel,
    sendAsReply: null,
    title: "Server's Splash",
    imageUrl,
    requesterId: message.author.id,
    idPrefix: 'serversplash',
  });
}

export async function slashExecute(interaction: any, _client: LevitateClient): Promise<any> {
  await interaction.deferReply();
  const guild = interaction.guild;
  if (!guild) return sendError({ interaction }, 'This command can only be used in a server.');

  const imageUrl = guild.splashURL({ size: 4096 });
  if (!imageUrl) return sendError({ interaction }, 'This server does not have a splash image.');

  return sendImagePanel({
    channel: interaction.channel,
    sendAsReply: (payload: any) => interaction.editReply(payload),
    title: "Server's Splash",
    imageUrl,
    requesterId: interaction.user.id,
    idPrefix: 'serversplash',
  });
}
