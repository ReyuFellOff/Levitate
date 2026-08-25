// xoxo/commands/moderation/warnings.ts
//
// View a member's warnings.
//
// Prefix:  $warnings <@user|ID|username>
// Slash:   /warnings user:<user>

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildWarningsListPayload } from '../../components/moderation/warn.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'warnings',
  aliases:     ['warns'] as string[],
  description: "View a member's warnings.",
  usage:       'warnings <@user|ID|username>',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!args[0])
    return sendError(ctx, `**Usage:** \`${client.config.prefix}${options.usage}\``);

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  const warnings = await client.db.getWarnings(message.guild.id, targetUser.id);
  await message.channel.send(buildWarningsListPayload(targetUser, warnings));
}

export async function slashExecute(
  interaction: any,
  client:      CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };

  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const targetUser = interaction.options.getUser('user', true);
  const warnings = await client.db.getWarnings(interaction.guild.id, targetUser.id);
  await interaction.editReply(buildWarningsListPayload(targetUser, warnings));
}
