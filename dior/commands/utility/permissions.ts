// xoxo/commands/utility/permissions.ts

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildPermissionsPayload } from '../../components/utility/permissions.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { resolveRole } from '../../helpers/roleResolver.js';

export const options = {
  name: 'permissions',
  aliases: ['perms'] as string[],
  description: 'Show the permissions a user has in this server.',
  usage: 'permissions [@user | user ID | username | @role | role ID | role name]',
  category: 'utility',
  owner: false,
  cooldown: 5,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const input = args.join(' ');
  const user = input ? await resolveUser(client, message.guild, input) : message.author;
  if (user) {
    const member = await message.guild.members.fetch(user.id).catch((): null => null);
    return message.channel.send(
      buildPermissionsPayload(user, member, message.guild.ownerId === user.id),
    );
  }

  const role = input ? resolveRole(message.guild, input) : null;
  if (!role) return sendError(ctx, 'User or role not found. Try a mention, ID, or name.');
  return message.channel.send(
    buildPermissionsPayload(role, role, false, true),
  );
}

export async function slashExecute(interaction: any, _client: CassieClient): Promise<any> {
  await interaction.deferReply();
  const user = interaction.options.getUser('user');
  if (user) {
    const member = interaction.guild
      ? await interaction.guild.members.fetch(user.id).catch((): null => null)
      : null;
    return interaction.editReply(
      buildPermissionsPayload(user, member, interaction.guild?.ownerId === user.id),
    );
  }

  const input = interaction.options.getString('role');
  const role = interaction.guild && input ? resolveRole(interaction.guild, input) : null;
  if (!role) return sendError({ interaction }, 'User or role not found. Try a mention, ID, or name.');

  return interaction.editReply(
    buildPermissionsPayload(role, role, false, true),
  );
}
