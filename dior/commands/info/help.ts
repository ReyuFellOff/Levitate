// xoxo/commands/info/help.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import {
  buildHelpMenuPayload,
  buildCategoryPayload,
  buildCommandInfoPayload,
  registerHelpSession,
  resolveHelpCategory,
} from '../../components/info/helpMenu.js';
import { sendError, reservedForDeveloper } from '../../components/statusMessages.js';

export const options = {
  name: 'help',
  aliases: ['h'] as string[],
  description: 'Shows the Cassie help menu.',
  usage: `help
  help <command name | category>`,
  category: 'info',
  owner: false,
  cooldown: 2,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  const input = args[0]?.toLowerCase();
  const categoryInput = args.join(' ').trim().toLowerCase();

  if (input) {
    const categoryName = resolveHelpCategory(client, categoryInput);
    if (categoryName) {
      const payload = await buildCategoryPayload(
        client,
        message.author.id,
        categoryName,
        message.guild?.id ?? null,
      );
      const sent = await message.channel.send(payload as any);

      registerHelpSession(sent.id, {
        page: categoryName,
        userId: message.author.id,
        guildId: message.guild?.id ?? null,
        channelId: message.channel.id,
        client,
      });
      return;
    }

    const resolvedName: string | undefined = (client.commands as any)?.has(input)
      ? input
      : (client.aliases as any)?.get(input);

    if (!resolvedName) {
      await sendError({ message }, `No command called \`${input}\` found.`);
      return;
    }

    const command = (client.commands as any)?.get(resolvedName);
    const isDevCommand = command?.options?.owner === true || command?.options?.isDeveloper === true;
    const invokerIsDev = client.config.developers.some(([, id]: [string, string]) => id === message.author.id);
    if (isDevCommand && !invokerIsDev) {
      await reservedForDeveloper({ message });
      return;
    }

    const payload = await buildCommandInfoPayload(client, resolvedName, message.guild?.id ?? null);
    if (!payload) {
      await sendError({ message }, `No command called \`${input}\` found.`);
      return;
    }

    await message.channel.send(payload as any);
    return;
  }

  const payload = await buildHelpMenuPayload(client, message.author.id, message.guild?.id ?? null);
  const sent = await message.channel.send(payload as any);

  registerHelpSession(sent.id, {
    page: 'home',
    userId: message.author.id,
    guildId: message.guild?.id ?? null,
    channelId: message.channel.id,
    client,
  });
}

export async function slashExecute(interaction: any, client: CassieClient) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  const input = interaction.options?.getString('command')?.trim() ?? '';
  const categoryName = input ? resolveHelpCategory(client, input) : undefined;

  if (categoryName) {
    const payload = await buildCategoryPayload(
      client,
      interaction.user.id,
      categoryName,
      interaction.guild?.id ?? null,
    );
    await interaction.editReply(payload as any);

    const reply = await interaction.fetchReply().catch((): null => null);
    if (reply) {
      registerHelpSession(reply.id, {
        page: categoryName,
        userId: interaction.user.id,
        guildId: interaction.guild?.id ?? null,
        channelId: interaction.channelId,
        client,
      });
    }
    return;
  }

  const payload = await buildHelpMenuPayload(client, interaction.user.id, interaction.guild?.id ?? null);
  await interaction.editReply(payload as any);

  const reply = await interaction.fetchReply().catch((): null => null);
  if (reply) {
    registerHelpSession(reply.id, {
      page: 'home',
      userId: interaction.user.id,
      guildId: interaction.guild?.id ?? null,
      channelId: interaction.channelId,
      client,
    });
  }
}
