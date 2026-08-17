// xoxo/commands/info/debug.ts
//
// Display a detailed multi-page stats menu for the bot.
// Available to everyone — useful for users to inspect bot health.

import { ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { emojis } from '../../emojis.js';
import { gatherDebugStats } from '../../helpers/debugStats.js';
import {
  buildDebugHomePayload,
  registerDebugSession,
  type DebugSession,
} from '../../messages/debug.js';

export const options = {
  name:        'debug',
  aliases:     ['botstats'] as string[],
  description: 'Display a detailed multi-page stats menu for the bot.',
  usage:       'debug',
  category:    'info',
  owner:       false,
  cooldown:    5,
};

// ── Prefix ───────────────────────────────────────────────────────────────────

export async function prefixExecute(message: any, _args: string[], client: LevitateClient): Promise<void> {
  const loadingContainer = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${emojis.loading} Gathering stats…`),
  );

  const before = Date.now();
  const sent = await message.channel.send({
    components:      [loadingContainer],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
  const apiMs = Date.now() - before;

  const prefix: string = client.config.prefix;
  const stats  = await gatherDebugStats(client, apiMs);
  const payload = buildDebugHomePayload(stats, message.author.username, prefix, false, client);
  await sent.edit(payload as any);

  const session: DebugSession = {
    page:           'home',
    stats,
    userId:         message.author.id,
    authorUsername: message.author.username,
    channelId:      message.channel.id,
    prefix,
    client,
  };
  registerDebugSession(sent.id, session);
}

// ── Slash ────────────────────────────────────────────────────────────────────

export async function slashExecute(interaction: any, client: LevitateClient): Promise<void> {
  const before = Date.now();

  await interaction.reply({
    components: [
      new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emojis.loading} Gathering stats…`),
      ),
    ],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });

  const apiMs = Date.now() - before;
  const sent  = await interaction.fetchReply();

  const prefix: string = client.config.prefix;
  const stats  = await gatherDebugStats(client, apiMs);
  const payload = buildDebugHomePayload(stats, interaction.user.username, prefix, false, client);
  await interaction.editReply(payload as any);

  const session: DebugSession = {
    page:           'home',
    stats,
    userId:         interaction.user.id,
    authorUsername: interaction.user.username,
    channelId:      interaction.channel?.id ?? interaction.channelId,
    prefix,
    client,
  };
  registerDebugSession(sent.id, session);
}
