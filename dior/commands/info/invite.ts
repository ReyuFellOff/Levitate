// xoxo/commands/info/invite.ts
//
// $invite — Show the bot's invite link and support server link.

import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { config, getInviteUrl } from '../../config.js';
import { emojis }              from '../../emojis.js';

export const options = {
  name:        'invite',
  aliases:     ['addbot', 'botinvite', 'inv'] as string[],
  description: 'Get the link to add this bot to your server and join the support server.',
  usage:       'invite',
  category:    'info',
  owner:       false,
  cooldown:    5,
};

function buildPayload(client: CassieClient): object {
  const inviteUrl  = getInviteUrl(client.config?.clientId ?? null);
  const supportUrl = client.config?.supportServer ?? 'https://discord.gg/YpCfcCTXdv';
  const botName    = client.user?.username ?? client.config?.botName ?? 'the bot';

  const inviteLine = inviteUrl
    ? `${emojis.whiteArrow} [**Invite to a Server**](${inviteUrl})\nAdds ${botName} to any server you manage.`
    : `${emojis.whiteArrow} **Invite to a Server**\nContact a developer to get the invite link.`;

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.brownishSparkles} Add ${botName}`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(inviteLine),
    )
    .addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Need help? Join the [Support Server](${supportUrl}).`,
      ),
    );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  CassieClient,
): Promise<any> {
  return message.channel.send(buildPayload(client));
}

export async function slashExecute(
  interaction: any,
  client:      CassieClient,
): Promise<any> {
  return interaction.reply(buildPayload(client));
}
