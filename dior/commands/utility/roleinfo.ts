// xoxo/commands/utility/roleinfo.ts
//
// $roleinfo — show details for one role without interactive controls.

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildRoleInfoPayload } from '../../components/utility/list.js';
import { resolveRole } from '../../helpers/roleResolver.js';

export const options = {
  name: 'roleinfo',
  aliases: ['ri'] as string[],
  description: 'Show detailed information about a role.',
  usage: 'roleinfo <@role | role ID | role name>',
  category: 'utility',
  owner: false,
  cooldown: 5,
};

export async function prefixExecute(
  message: any,
  args: string[],
  _client: CassieClient,
): Promise<any> {
  const ctx = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!args.length) return sendError(ctx, `Usage: \`${options.usage}\``);

  const role = resolveRole(guild, args.join(' '));
  if (!role) {
    return sendError(ctx, 'Role not found. Use a role mention, role ID, or role name.');
  }

  return message.channel.send(buildRoleInfoPayload(role));
}

export async function slashExecute(
  interaction: any,
  _client: CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const guild = interaction.guild;
  if (!guild) return sendError({ interaction }, 'This command can only be used in a server.');

  const input = (interaction.options.getString('role', true) as string).trim();
  const role = resolveRole(guild, input);
  if (!role) {
    return sendError({ interaction }, 'Role not found. Use a role mention, role ID, or role name.');
  }

  return interaction.editReply(buildRoleInfoPayload(role));
}