// xoxo/components/moderation/hackban.ts
//
// CV2 payload for the hackban/forceban command — success panel only.
// No DM is attempted (the target may not share a server with the bot).

import {
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';

export function buildHackbanSuccessPayload(
  userId:            string,
  username:          string | null,
  reason:            string,
  moderatorUsername: string,
): any {
  const bodyLines = [
    username ? `**User:** ${username} (\`${userId}\`)` : `**User ID:** \`${userId}\``,
    `**Reason:** ${reason || 'None provided.'}`,
    `**Moderator:** ${moderatorUsername}`,
  ].join('\n');

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blackCards} Hackbanned`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
