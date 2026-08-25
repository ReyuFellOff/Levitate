// xoxo/commands/fun/wanted.ts
//
// $wanted — puts a user's avatar on a Wild West / Mexican-desert style
// "WANTED" poster (classy sepia parchment aesthetic).
//
// Usage:
//   $wanted              — poster for the author
//   $wanted <@user|ID>   — poster for the given user

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildWantedPayload } from '../../components/fun/wanted.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'wanted',
  aliases:     [] as string[],
  description: 'Turn a user into a Wild West wanted poster.',
  usage:       'wanted\nwanted <@user|ID|username>',
  category:    'fun',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  let user: any = message.author;
  if (args.length > 0) {
    const resolved = await resolveUser(client, message.guild, args[0]);
    if (!resolved) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);
    user = resolved;
  }

  const payload = await buildWantedPayload({ user, invokerUsername: message.author.username });
  return message.channel.send(payload);
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();

  const rawUser = interaction.options.getUser('user') ?? interaction.user;
  const payload = await buildWantedPayload({ user: rawUser, invokerUsername: interaction.user.username });
  return interaction.editReply(payload);
}
