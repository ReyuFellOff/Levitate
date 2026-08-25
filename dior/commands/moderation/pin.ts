import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import {
  canManageMessages,
  resolveMessageTarget,
} from '../../utils/messageTarget.js';

export const options = {
  name:        'pin',
  aliases:     [] as string[],
  description: 'Pin a message by replying to it, message ID, or Discord link.',
  usage:       'pin [message ID | message link]',
  category:    'moderation',
  owner:       false,
  userPerms:   ['ManageMessages'],
  cooldown:    3,
};

export async function prefixExecute(
  message: any,
  args: string[],
  _client: CassieClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');
  if (args.length > 1) {
    return sendError(ctx, 'Provide only one message ID or Discord message link.');
  }

  if (!canManageMessages(message.channel, message.member)) {
    return sendError(ctx, 'You need the **Manage Messages** permission to use this command.');
  }

  const target = await resolveMessageTarget(
    message.guild,
    message.channel,
    args[0],
    {
      channelId:  message.reference?.channelId,
      messageId:  message.reference?.messageId,
    },
  );
  if ('error' in target) return sendError(ctx, target.error);

  const botMember = message.guild.members.me
    ?? await message.guild.members.fetchMe().catch((): null => null);
  if (!canManageMessages(target.channel, message.member)) {
    return sendError(ctx, 'You need the **Manage Messages** permission in the target channel to pin messages.');
  }
  if (!canManageMessages(target.channel, botMember)) {
    return sendError(ctx, 'I need the **Manage Messages** permission in the target channel to pin messages.');
  }
  if (target.message.pinned) {
    return sendInfo(ctx, 'That message is already pinned.');
  }

  try {
    await target.message.pin('Pinned by moderation command.');
  } catch (error: unknown) {
    console.error(`[pin] Failed to pin message ${target.message.id}:`, error);
    return sendError(ctx, 'I could not pin that message. Check my permissions and try again.');
  }

  return sendSuccess(ctx, `Pinned [the message](${target.message.url}).`);
}
