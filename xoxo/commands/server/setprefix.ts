// xoxo/commands/server/setprefix.ts
//
// Sets or resets this server's custom command prefix.
// Requires Manage Guild permission. Persisted to MongoDB.
//
// Prefix execute:  $setprefix <new_prefix>
//                  $setprefix reset
// Slash execute:   /setprefix new_prefix:<prefix>
//                  /resetprefix

import type { LevitateClient } from '../../structures/LevitateClient.js';
import {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';

export const options = {
  name: 'setprefix',
  aliases: ['prefix', 'changeprefix'],
  description: "Set or reset this server's custom command prefix.",
  usage: 'setprefix <new prefix | reset>',
  category: 'settings',
  owner: false,
  cooldown: 5,
};

const MAX_LEN = 10;

function reply(content: string) {
  return {
    components: [
      new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(content),
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

// ── Prefix execute ────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args: string[],
  client: LevitateClient,
): Promise<void> {
  // Require Manage Guild
  if (!message.member?.permissions?.has('ManageGuild')) {
    await message.reply(reply(`${emojis.redcross} You need the **Manage Server** permission to change the prefix.`));
    return;
  }

  if (!client.db) {
    await message.reply(reply(`${emojis.redcross} Database is not connected. Please try again later.`));
    return;
  }

  const input = args[0]?.toLowerCase();

  if (!input) {
    const current = await client.db.getGuildPrefix(message.guild.id).catch((): null => null) ?? client.config.prefix;
    await message.reply(reply(
      `${emojis.info} Current prefix for this server: \`${current}\`\n` +
      `Use \`${current}setprefix <new prefix>\` to change it, or \`${current}setprefix reset\` to restore the default.`,
    ));
    return;
  }

  if (input === 'reset') {
    await client.db.removeGuildPrefix(message.guild.id);
    await message.reply(reply(
      `${emojis.greentick} Prefix reset to the default: \`${client.config.prefix}\``,
    ));
    return;
  }

  if (input.length > MAX_LEN) {
    await message.reply(reply(`${emojis.redcross} Prefix is too long — maximum is **${MAX_LEN}** characters.`));
    return;
  }

  await client.db.setGuildPrefix(message.guild.id, input);
  await message.reply(reply(`${emojis.greentick} Server prefix updated to: \`${input}\``));
}

// ── Slash execute (/setprefix) ────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  client: LevitateClient,
): Promise<void> {
  if (!interaction.member?.permissions?.has('ManageGuild')) {
    await interaction.reply({ ...reply(`${emojis.redcross} You need the **Manage Server** permission to change the prefix.`), flags: MessageFlags.Ephemeral });
    return;
  }

  if (!client.db) {
    await interaction.reply({ ...reply(`${emojis.redcross} Database is not connected. Please try again later.`), flags: MessageFlags.Ephemeral });
    return;
  }

  const input: string = interaction.options.getString('new_prefix', true).trim();

  if (input.length > MAX_LEN) {
    await interaction.reply({ ...reply(`${emojis.redcross} Prefix is too long — maximum is **${MAX_LEN}** characters.`), flags: MessageFlags.Ephemeral });
    return;
  }

  await client.db.setGuildPrefix(interaction.guild.id, input);
  await interaction.reply(reply(`${emojis.greentick} Server prefix updated to: \`${input}\``));
}
