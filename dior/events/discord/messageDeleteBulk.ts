// xoxo/events/discord/messageDeleteBulk.ts
//
// Logging: fires when messages are bulk-deleted (e.g. via $purge).

import type { CassieClient } from '../../structures/CassieClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import { buildMessageBulkDeletePayload } from '../../components/logging/logMessages.js';
import {
  findVoiceMasterDeletionExecutor,
  getVoiceMasterSetup,
  restoreVoiceMasterPanel,
} from '../../helpers/voiceMaster.js';

export const name = 'messageDeleteBulk';
export const once = false;

export async function execute(messages: any, channel: any, client: CassieClient): Promise<void> {
  const targetChannel = channel ?? messages.first()?.channel;
  if (!targetChannel?.guild) return;

  const setup = await getVoiceMasterSetup(client, targetChannel.guild.id);
  const deletedPanel = setup?.control_channel_id === targetChannel.id
    && (typeof messages?.has === 'function'
      ? messages.has(setup.control_message_id)
      : [...(messages?.values?.() ?? messages ?? [])]
        .some((message: any) => message?.id === setup.control_message_id));

  if (deletedPanel) {
    const deleter = await findVoiceMasterDeletionExecutor(
      targetChannel.guild,
      targetChannel.id,
      null,
      true,
    );
    await restoreVoiceMasterPanel(client, targetChannel.guild, targetChannel, deleter);
  }

  const payload = buildMessageBulkDeletePayload(targetChannel, messages.size ?? messages.length ?? 0);
  await dispatchLog(client, targetChannel.guild.id, 'message', [targetChannel.id], payload);
}
