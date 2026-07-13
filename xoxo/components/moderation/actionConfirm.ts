// xoxo/components/moderation/actionConfirm.ts
//
// Generic slash-command confirmation wrapper for single-target moderation
// actions (ban/kick/timeout/untimeout). Prefix commands are left as-is —
// only slash commands get this extra confirmation dialog per design.

import {
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
  buildActionCancelledPayload,
} from '../purgeConfirm.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';

export async function confirmSlashAction(opts: {
  interaction: any;
  title:       string;
  description: string;
  onConfirm:   () => Promise<void>;
}): Promise<void> {
  const { interaction, title, description, onConfirm } = opts;

  const confirmId = `sc:confirm:${interaction.id}`;
  const cancelId  = `sc:cancel:${interaction.id}`;

  await interaction.editReply(buildActionConfirmPayload(confirmId, cancelId, title, description));
  const confirmMsg = await interaction.fetchReply().catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
      i, interaction.user.id,
      (cid) => cid === confirmId || cid === cancelId,
    ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await onConfirm();
    } else {
      await i
        .editReply(buildActionCancelledPayload(confirmId, cancelId, title, description))
        .catch((): null => null);
    }
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildActionTimedOutPayload(confirmId, cancelId, title, description))
      .catch((): null => null);
  });
}
