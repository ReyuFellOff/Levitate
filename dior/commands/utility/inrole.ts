// xoxo/commands/utility/inrole.ts
//
// $inrole — list members with a role.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { resolveRole } from '../../helpers/roleResolver.js';
import {
  buildListPayload,
  registerListSession,
} from '../../components/utility/list.js';

export const options = {
  name:        'inrole',
  aliases:     [] as string[],
  description: 'List members who have a role.',
  usage:       'inrole <role mention, ID, or name>',
  category:    'utility',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!args.length) return sendError(ctx, `Usage: \`${client.config.prefix}${options.usage}\``);

  const role = resolveRole(guild, args.join(' '));
  if (!role) return sendError(ctx, 'Role not found. Use a role mention, ID, or name.');

  await message.channel.sendTyping?.().catch((): null => null);
  await guild.members.fetch().catch((): null => null);

  const items = [...role.members.values()].sort((a: any, b: any) =>
    (a.displayName ?? a.user?.username ?? '').localeCompare(b.displayName ?? b.user?.username ?? ''),
  );
  if (!items.length) return sendError(ctx, `No members have ${role}.`);

  const session: import('../../components/utility/list.js').ListSession = {
    userId:    message.author.id,
    channelId: message.channelId,
    guildId:   guild.id,
    listType:  'members',
    items,
    page:      0,
    detailId:  null as string | null,
    client,
    heading:   `Members with ${role}`,
  };

  const sent = await message.channel.send(buildListPayload(session)).catch((): null => null);
  if (!sent) return;
  registerListSession(sent.id, session);
}

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const guild = interaction.guild;
  if (!guild) return sendError({ interaction }, 'This command can only be used in a server.');

  const input = (interaction.options.getString('role', true) as string).trim();
  const role = resolveRole(guild, input);
  if (!role) return sendError({ interaction }, 'Role not found. Use a role mention, ID, or name.');

  await guild.members.fetch().catch((): null => null);
  const items = [...role.members.values()].sort((a: any, b: any) =>
    (a.displayName ?? a.user?.username ?? '').localeCompare(b.displayName ?? b.user?.username ?? ''),
  );
  if (!items.length) return interaction.editReply({ content: `No members have ${role}.` });

  const session: import('../../components/utility/list.js').ListSession = {
    userId:    interaction.user.id,
    channelId: interaction.channelId,
    guildId:   guild.id,
    listType:  'members',
    items,
    page:      0,
    detailId:  null as string | null,
    client,
    heading:   `Members with ${role}`,
  };

  await interaction.editReply(buildListPayload(session));
  try {
    const msg = await interaction.fetchReply();
    registerListSession(msg.id, session);
  } catch { /* ignore — the list still works for this reply */ }
}