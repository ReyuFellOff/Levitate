import { config } from '../../config.js';
// xoxo/commands/settings/resetprefix.ts
//
// Resets this server's custom prefix back to the global default.
// Requires Manage Guild. Slash-only entry point — prefix path uses
// `setprefix reset` instead.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';

export const options = {
  name: 'resetprefix',
  aliases: [] as string[],
  description: "Remove this server's custom prefix and revert to the global default.",
  usage: 'resetprefix',
  category: 'settings',
  owner: false,
  cooldown: 5,
};

function reply(content: string) {
  return {
    components: [
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(content),
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

export async function prefixExecute(
  message: any,
  _args: string[],
  client: LevitateClient,
): Promise<void> {
  if (!message.member?.permissions?.has('ManageGuild')) {
    await message.reply(reply(`${emojis.redcross} You need the **Manage Server** permission to reset the prefix.`));
    return;
  }

  if (!client.db) {
    await message.reply(reply(`${emojis.redcross} Database is not connected. Please try again later.`));
    return;
  }

  await client.db.removeGuildPrefix(message.guild.id);
  await message.reply(reply(`${emojis.greentick} Prefix reset to the default: \`${client.config.prefix}\``));
}

export async function slashExecute(
  interaction: any,
  client: LevitateClient,
): Promise<void> {
  if (!interaction.member?.permissions?.has('ManageGuild')) {
    await interaction.reply({ ...reply(`${emojis.redcross} You need the **Manage Server** permission to reset the prefix.`), flags: MessageFlags.Ephemeral });
    return;
  }

  if (!client.db) {
    await interaction.reply({ ...reply(`${emojis.redcross} Database is not connected. Please try again later.`), flags: MessageFlags.Ephemeral });
    return;
  }

  await client.db.removeGuildPrefix(interaction.guild.id);
  await interaction.reply(reply(`${emojis.greentick} Prefix reset to the default: \`${client.config.prefix}\``));
}
