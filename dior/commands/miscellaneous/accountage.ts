// xoxo/commands/miscellaneous/accountage.ts

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildAccountAgePayload } from '../../components/utility/accountAge.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { getDominantColor } from '../../helpers/dominantColor.js';

export const options = {
  name: 'accountage',
  aliases: ['age'] as string[],
  description: 'Show how long a Discord account has existed.',
  usage: 'accountage [@user | user ID | username]',
  category: 'miscellaneous',
  owner: false,
  cooldown: 5,
};

async function resolveTarget(message: any, args: string[], client: CassieClient): Promise<any | null> {
  return args.length ? resolveUser(client, message.guild, args.join(' ')) : message.author;
}

export async function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const user = await resolveTarget(message, args, client);
  if (!user) return sendError(ctx, 'User not found. Try a mention, user ID, or username.');
  const member = await message.guild.members.fetch(user.id).catch((): null => null);

  const avatarUrl = member?.avatarURL?.({ size: 4096 }) ?? user.displayAvatarURL({ size: 4096 });
  return message.channel.send(buildAccountAgePayload(user, member, await getDominantColor(avatarUrl)));
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();
  const user = interaction.options.getUser('user') ?? interaction.user;
  const member = interaction.guild
    ? await interaction.guild.members.fetch(user.id).catch((): null => null)
    : null;

  const avatarUrl = member?.avatarURL?.({ size: 4096 }) ?? user.displayAvatarURL({ size: 4096 });
  return interaction.editReply(buildAccountAgePayload(user, member, await getDominantColor(avatarUrl)));
}
