// xoxo/commands/utility/webhook.ts
//
// $webhook — interactive webhook manager.
//
// Opens a live panel to create, inspect, rename, re-avatar, move, delete,
// and send messages through native Discord webhooks in this server.
//
// All builder logic and session state lives in:
//   xoxo/components/utility/webhook.ts

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { startWebhookSession } from '../../components/utility/webhook.js';

export const options = {
  name:        'webhook',
  aliases:     ['webhooks', 'wh'] as string[],
  description: 'Interactively create, manage, and send messages through webhooks.',
  usage:       'webhook',
  category:    'features',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  LevitateClient,
): Promise<void> {
  if (!message.guild) {
    await sendError({ message }, 'This command can only be used in a server.');
    return;
  }

  const memberPerms = message.member?.permissions;
  if (!memberPerms?.has?.(PermissionFlagsBits.ManageWebhooks)) {
    await sendError({ message }, 'You need the **Manage Webhooks** permission to use this command.');
    return;
  }

  const botPerms = message.channel.permissionsFor?.(message.guild.members.me);
  if (!botPerms?.has?.(PermissionFlagsBits.ManageWebhooks)) {
    await sendError({ message }, 'I need the **Manage Webhooks** permission to run the webhook manager.');
    return;
  }

  await startWebhookSession(message, client, message.author.id);
}
