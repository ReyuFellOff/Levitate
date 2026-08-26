import { config } from '../../config.js';
// xoxo/commands/info/ping.ts

import { MessageFlags, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { buildPingPayload } from '../../components/info/ping.js';
import { resolveWsPing } from '../../utils/wsPing.js';
import { emojis } from '../../emojis.js';

export const options = {
  name:        'ping',
  aliases:     [] as string[],
  description: "Check the bot's latency and connection health.",
  usage:       'ping',
  category:    'info',
  owner:       false,
  cooldown:    5,
};

// ── Prefix ───────────────────────────────────────────────────────────────────

export async function prefixExecute(message: any, _args: string[], client: CassieClient): Promise<void> {
  const before = Date.now();

  const sent = await message.channel.send({
    components: [
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emojis.loading} Checking latencies…`),
      ),
    ],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });

  const apiLatency = Date.now() - before;
  const wsPing     = resolveWsPing(client, apiLatency);
  const dbLatency  = client.db ? await client.db.ping().catch((): null => null) : null;
  const guildPrefix: string = client.config.prefix;

  await sent.edit({
    components: [
      buildPingPayload({ apiLatency, wsPing, dbLatency, guildPrefix, authorUsername: message.author.username }),
    ],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

// ── Slash ────────────────────────────────────────────────────────────────────

export async function slashExecute(interaction: any, client: CassieClient): Promise<void> {
  await interaction.deferReply();

  const apiLatency  = Date.now() - interaction.createdTimestamp;
  const wsPing      = resolveWsPing(client, apiLatency);
  const dbLatency   = client.db ? await client.db.ping().catch((): null => null) : null;
  const guildPrefix: string = client.config.prefix;

  await interaction.editReply({
    components: [
      buildPingPayload({ apiLatency, wsPing, dbLatency, guildPrefix, authorUsername: interaction.user.username }),
    ],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}
