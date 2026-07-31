// xoxo/commands/info/invite.ts
//
// Sends the bot's invite link as a CV2 message.
// No accent color — clean and minimal.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { getInviteUrl } from '../../config.js';
import { emojis } from '../../emojis.js';

export const options = {
  name: 'invite',
  aliases: [] as string[],
  description: 'Get the invite link to add the bot to your server or app.',
  usage: 'invite',
  category: 'info',
  owner: false,
  cooldown: 5,
};

const NO_MENTIONS = { parse: [] as any[] };

function buildInvitePayload(botName: string, inviteUrl: string, supportUrl: string): any {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${emojis.brownishSparkles} Add ${botName}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojis.whiteArrow} **[Invite to a Server](${inviteUrl})**\n` +
        `-# Adds ${botName} to any server you manage.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Need help? Join the [Support Server](${supportUrl}).`,
      ),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: NO_MENTIONS,
  };
}

export async function prefixExecute(message: any, _args: string[], client: LevitateClient): Promise<void> {
  const inviteUrl = getInviteUrl(client.config?.clientId);
  if (!inviteUrl) {
    await message.channel.send({ content: 'Invite link unavailable.' });
    return;
  }
  const supportUrl: string = (client.config as any)?.supportServer ?? '';
  const botName: string = client.config?.botName ?? 'Levitate';
  await message.channel.send(buildInvitePayload(botName, inviteUrl, supportUrl));
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<void> {
  const inviteUrl = getInviteUrl(client.config?.clientId);
  if (!inviteUrl) {
    await interaction.reply({ content: 'Invite link unavailable.', flags: MessageFlags.Ephemeral });
    return;
  }
  const supportUrl: string = (client.config as any)?.supportServer ?? '';
  const botName: string = client.config?.botName ?? 'Levitate';
  await interaction.reply(buildInvitePayload(botName, inviteUrl, supportUrl));
}
