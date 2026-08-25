// xoxo/components/fun/imageHandler.ts
//
// Global interaction handler for all image:* button interactions.
// Imported by interactionCreate.ts.

import { MessageFlags } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import {
  getImageSession,
  resetImageTimeout,
  parseImageId,
  buildImagePayload,
} from './image.js';

export async function handleImageInteraction(interaction: any, _client: CassieClient): Promise<void> {
  const parsed = parseImageId(interaction.customId as string);
  if (!parsed) {
    await interaction.reply({ content: 'Unknown image action.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }

  const { action, msgId } = parsed;

  // noop buttons (disabled / counter) — acknowledge silently
  if (action === 'noop') {
    await interaction.deferUpdate().catch((): null => null);
    return;
  }

  const session = getImageSession(msgId);
  if (!session) {
    await interaction.reply({
      content: 'This image session has expired. Run the command again.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  // Only the person who ran the command can navigate
  if (interaction.user.id !== session.authorId) {
    await interaction.reply({
      content: 'Only the person who ran this command can navigate it.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  if (action === 'prev') {
    if (session.index > 0) session.index--;
  } else if (action === 'next') {
    if (session.index < session.results.length - 1) session.index++;
  }

  resetImageTimeout(msgId);
  await interaction.update(buildImagePayload(session)).catch((): null => null);
}
