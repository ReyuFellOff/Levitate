import { ZipArchive } from 'archiver';
import { AttachmentBuilder } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendLoading, sendSuccess } from '../../components/statusMessages.js';

export const options = {
  name:        'emojizip',
  aliases:     ['emojiexport'] as string[],
  description: 'Export this server\'s custom emojis as a ZIP file.',
  usage:       'emojizip',
  category:    'miscellaneous',
  owner:       false,
  cooldown:    15,
};

const DOWNLOAD_TIMEOUT_MS = 15_000;

function safeFilename(name: string, extension: string, used: Set<string>): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+$/, 'emoji') || 'emoji';
  let filename = `${base}.${extension}`;
  let suffix = 2;
  while (used.has(filename)) {
    filename = `${base}-${suffix}.${extension}`;
    suffix++;
  }
  used.add(filename);
  return filename;
}

async function createEmojiZip(emojis: Iterable<any>): Promise<{ buffer: Buffer; failed: string[] }> {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  const failed: string[] = [];

  const archivePromise = new Promise<Buffer>((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const usedNames = new Set<string>();
  for (const emoji of emojis) {
    const extension = emoji.animated ? 'gif' : 'png';
    const filename = safeFilename(emoji.name ?? emoji.id, extension, usedNames);

    try {
      const response = await fetch(String(emoji.url), {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      archive.append(Buffer.from(await response.arrayBuffer()), { name: filename });
    } catch {
      failed.push(emoji.name ?? emoji.id);
    }
  }

  await archive.finalize();
  return { buffer: await archivePromise, failed };
}

export async function prefixExecute(
  message: any,
  _args: string[],
  _client: LevitateClient,
): Promise<any> {
  const context = { message };
  if (!message.guild) return sendError(context, 'This command can only be used in a server.');

  const emojis = [...message.guild.emojis.cache.values()];
  if (!emojis.length) return sendError(context, 'This server has no custom emojis to export.');

  const loading = await sendLoading(context, `Preparing a ZIP of **${emojis.length}** emoji${emojis.length === 1 ? '' : 's'}...`);

  try {
    const { buffer, failed } = await createEmojiZip(emojis);
    if (!buffer.length) {
      return sendError(
        { message, existingMessage: loading as any },
        'None of the server emojis could be downloaded.',
      );
    }

    const filename = `${message.guild.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'server'}-emojis.zip`;
    await message.channel.send({ files: [new AttachmentBuilder(buffer, { name: filename })] });

    const result = failed.length
      ? `Exported **${emojis.length - failed.length}/${emojis.length}** emojis to **${filename}**. Skipped: ${failed.map((name) => `\`${name}\``).join(', ')}.`
      : `Exported **${emojis.length}** emoji${emojis.length === 1 ? '' : 's'} to **${filename}**.`;
    return sendSuccess({ message, existingMessage: loading as any }, result);
  } catch (error: any) {
    console.error('[EMOJIZIP]', error);
    return sendError(
      { message, existingMessage: loading as any },
      `Failed to create the emoji ZIP: ${error?.message ?? 'unknown error'}`,
    );
  }
}
