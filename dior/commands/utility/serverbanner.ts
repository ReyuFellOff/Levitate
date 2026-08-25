import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { sendImagePanel } from '../../helpers/imagePanel.js';

export const options = {
  name: 'serverbanner',
  aliases: ['sbanner'],
  description: "Show this server's banner.",
  usage: 'serverbanner',
  category: 'utility',
  owner: false,
  cooldown: 3,
};

export async function prefixExecute(message: any, _args: string[], _client: CassieClient): Promise<any> {
  const guild = message.guild;
  if (!guild) return sendError({ message }, 'This command can only be used in a server.');

  const imageUrl = guild.bannerURL({ size: 4096 });
  if (!imageUrl) return sendError({ message }, 'This server does not have a banner.');

  return sendImagePanel({
    channel: message.channel,
    sendAsReply: null,
    title: "Server's Banner",
    imageUrl,
    requesterId: message.author.id,
    idPrefix: 'serverbanner',
  });
}

export async function slashExecute(interaction: any, _client: CassieClient): Promise<any> {
  await interaction.deferReply();
  const guild = interaction.guild;
  if (!guild) return sendError({ interaction }, 'This command can only be used in a server.');

  const imageUrl = guild.bannerURL({ size: 4096 });
  if (!imageUrl) return sendError({ interaction }, 'This server does not have a banner.');

  return sendImagePanel({
    channel: interaction.channel,
    sendAsReply: (payload: any) => interaction.editReply(payload),
    title: "Server's Banner",
    imageUrl,
    requesterId: interaction.user.id,
    idPrefix: 'serverbanner',
  });
}
