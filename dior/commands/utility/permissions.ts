// xoxo/commands/utility/permissions.ts

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildPermissionsPayload } from '../../components/utility/permissions.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name: 'permissions',
  aliases: ['perms'] as string[],
  description: 'Show the permissions a user has in this server.',
  usage: 'permissions [@user | user ID | username]',
  category: 'utility',
  owner: false,
  cooldown: 5,
};

export async function prefixExecute(message: any, args: string[], client: LevitateClient): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const user = args.length
    ? await resolveUser(client, message.guild, args.join(' '))
    : message.author;
  if (!user) return sendError(ctx, 'User not found. Try a mention, user ID, or username.');

  const member = await message.guild.members.fetch(user.id).catch((): null => null);
  return message.channel.send(
    buildPermissionsPayload(user, member, message.guild.ownerId === user.id),
  );
}

export async function slashExecute(interaction: any, _client: LevitateClient): Promise<any> {
  await interaction.deferReply();
  const user = interaction.options.getUser('user') ?? interaction.user;
  const member = interaction.guild
    ? await interaction.guild.members.fetch(user.id).catch((): null => null)
    : null;

  return interaction.editReply(
    buildPermissionsPayload(user, member, interaction.guild?.ownerId === user.id),
  );
}
