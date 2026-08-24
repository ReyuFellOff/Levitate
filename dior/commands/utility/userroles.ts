// xoxo/commands/utility/userroles.ts
//
// $userroles — list the roles assigned to a user.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildListPayload, registerListSession } from '../../components/utility/list.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'userroles',
  aliases:     [] as string[],
  description: 'List the roles assigned to a user.',
  usage:       'userroles [@user | user ID | username]',
  category:    'utility',
  owner:       false,
  cooldown:    5,
};

function getRoles(member: any, guild: any): any[] {
  return [...member.roles.cache.values()]
    .filter((role: any) => role.id !== guild.id)
    .sort((a: any, b: any) => b.position - a.position);
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const user = args.length
    ? await resolveUser(client, guild, args.join(' '))
    : message.author;
  if (!user) return sendError(ctx, 'User not found. Try a mention, user ID, or username.');

  const member = await guild.members.fetch(user.id).catch((): null => null);
  if (!member) return sendError(ctx, 'That user is not a member of this server.');

  const items = getRoles(member, guild);
  if (!items.length) return sendError(ctx, `**${user.username}** has no roles to display.`);

  const session: import('../../components/utility/list.js').ListSession = {
    userId:    message.author.id,
    channelId: message.channelId,
    guildId:   guild.id,
    listType:  'roles',
    items,
    page:      0,
    detailId:  null as string | null,
    client,
    heading:   `Roles for ${user}`,
  };

  const sent = await message.channel.send(buildListPayload(session)).catch((): null => null);
  if (sent) registerListSession(sent.id, session);
}

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const guild = interaction.guild;
  if (!guild) return sendError({ interaction }, 'This command can only be used in a server.');

  const user = interaction.options.getUser('user') ?? interaction.user;
  const member = await guild.members.fetch(user.id).catch((): null => null);
  if (!member) return sendError({ interaction }, 'That user is not a member of this server.');

  const items = getRoles(member, guild);
  if (!items.length) return interaction.editReply({ content: `**${user.username}** has no roles to display.` });

  const session: import('../../components/utility/list.js').ListSession = {
    userId:    interaction.user.id,
    channelId: interaction.channelId,
    guildId:   guild.id,
    listType:  'roles',
    items,
    page:      0,
    detailId:  null as string | null,
    client,
    heading:   `Roles for ${user}`,
  };

  await interaction.editReply(buildListPayload(session));
  try {
    const msg = await interaction.fetchReply();
    registerListSession(msg.id, session);
  } catch { /* ignore — the list still works for this reply */ }
}