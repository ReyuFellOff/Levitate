// xoxo/commands/customisation/setbanner.ts
//
// Change the bot's server banner. Requires Administrator permission.
//
// Usage:
//   setbanner <image attachment OR image URL>
//   setbanner reset

import { REST, Routes, MessageFlags } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendSuccess, sendError, sendLoading } from '../../components/statusMessages.js';
import { imageUrlToBase64, isValidImageUrl } from '../../utils/imageUtils.js';

export const options = {
  name: 'setbanner',
  aliases: ['setbn', 'setcover'] as string[],
  description: "Change the bot's server banner.",
  usage: `setbanner <image attachment OR image URL>
  setbanner reset`,
  category: 'customisation',
  owner: false,
  cooldown: 10,
};

async function patchBanner(guildId: string, banner: string | null, token: string): Promise<any> {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.patch(Routes.guildMember(guildId, '@me'), { body: { banner } });
}

async function handle(
  message: any,
  imageUrl: string | null,
  isReset: boolean,
  client: LevitateClient,
): Promise<any> {
  const statusCtx = { message };
  const successCtx = { channel: message.channel };

  const authorPerms = message.channel.permissionsFor?.(message.member);
  if (!authorPerms?.has?.('Administrator')) {
    return sendError(statusCtx, 'You need the **Administrator** permission to use this command.');
  }

  if (!isReset && !imageUrl) {
    return sendError(statusCtx, 'Please attach an image, provide a direct image URL, or use `reset`.');
  }

  const loadingMsg = await sendLoading(
    statusCtx,
    isReset ? 'Resetting server banner...' : 'Setting server banner...',
  );

  const token = client.config.botToken;
  if (!token) {
    await sendError(successCtx, 'Bot token is not configured.');
    return;
  }

  try {
    if (isReset) {
      await patchBanner(message.guild.id, null, token);
      await sendSuccess(successCtx, 'Server banner reset to global banner.');
    } else {
      const base64 = await imageUrlToBase64(imageUrl!);
      await patchBanner(message.guild.id, base64, token);
      await sendSuccess(successCtx, 'Server banner updated successfully.');
    }
    setTimeout(() => (loadingMsg as any)?.delete().catch((): null => null), 2000);
  } catch (err: any) {
    console.error('[SETBANNER]', err.message);
    return sendError(successCtx, `Failed to update banner: ${err.message}`);
  }
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  const memberPerms = interaction.member?.permissions;
  if (!memberPerms?.has?.('Administrator')) {
    return sendError({ interaction }, 'You need the **Administrator** permission to use this command.');
  }

  const isReset: boolean = interaction.options.getBoolean('reset') ?? false;
  const attachment: any = interaction.options.getAttachment('image') ?? null;

  if (!isReset && !attachment) {
    return sendError({ interaction }, 'Please provide an image attachment or enable the `reset` option.');
  }

  await interaction.deferReply();

  const token = client.config.botToken;
  if (!token) return sendError({ interaction }, 'Bot token is not configured.');

  try {
    if (isReset) {
      await patchBanner(interaction.guild.id, null, token);
      return sendSuccess({ interaction }, 'Server banner reset to global banner.');
    } else {
      const base64 = await imageUrlToBase64(attachment.url);
      await patchBanner(interaction.guild.id, base64, token);
      return sendSuccess({ interaction }, 'Server banner updated successfully.');
    }
  } catch (err: any) {
    console.error('[SETBANNER]', err.message);
    return sendError({ interaction }, `Failed to update banner: ${err.message}`);
  }
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient): Promise<any> {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');

  if (args[0]?.toLowerCase() === 'reset') {
    return handle(message, null, true, client);
  }

  let imageUrl: string | null = null;
  if (message.attachments.size) {
    imageUrl = message.attachments.first()?.url ?? null;
  } else if (args[0] && isValidImageUrl(args[0])) {
    imageUrl = args[0];
  }

  return handle(message, imageUrl, false, client);
}
