import { config } from '../../config.js';
// xoxo/commands/utility/membercount.ts
//
// Show the server's member count breakdown (total / users / bots).
// Developers can pass a guild ID to check any server the bot is in.

import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { emojis } from '../../emojis.js';
import { formatClock } from '../../utils/formatting.js';

export const options = {
  name: 'membercount',
  aliases: ['memcount', 'mc'] as string[],
  description: "Show the server's member count breakdown.",
  usage: 'membercount',
  category: 'utility',
  owner: false,
  cooldown: 5,
};

async function buildMembercountPayload(guild: any, requestedBy: string): Promise<object> {
  // Try a full member fetch to get an accurate bot/user split.
  // Fall back to the in-memory cache if the gateway rejects the request
  // (Server Members privileged intent not enabled in the Discord portal).
  let members: Map<string, any>;
  let usingCache = false;
  try {
    members = await guild.members.fetch();
  } catch {
    members = guild.members.cache;
    usingCache = true;
  }

  let users = 0;
  let bots  = 0;
  for (const [, member] of members) {
    if ((member as any).user.bot) bots++;
    else users++;
  }

  // Use guild.memberCount for total — it's always accurate regardless of intent.
  const total = guild.memberCount as number;

  const time = formatClock();

  const breakdown = usingCache
    ? [
        `${emojis.whiteArrow} Total Members: ${total}`,
        `${emojis.whiteArrow} Users (cached): ${users}`,
        `${emojis.whiteArrow} Bots (cached): ${bots}`,
      ].join('\n')
    : [
        `${emojis.whiteArrow} Total Members: ${total}`,
        `${emojis.whiteArrow} Users: ${users}`,
        `${emojis.whiteArrow} Bots: ${bots}`,
      ].join('\n');

  const footer = usingCache
    ? `-# Requested by ${requestedBy} at ${time} · User/bot split is approximate (cached members only)`
    : `-# Requested by ${requestedBy} at ${time}`;

  return new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${guild.name} Member count`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(breakdown),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footer),
    );
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();

  const ctx = { interaction };

  if (!interaction.guild) {
    return sendError(ctx, 'This command can only be used in a server.');
  }

  const developers: [string, string][] = client.config.developers;
  const isDeveloper = developers.some(([, id]) => id === interaction.user.id);

  let guild = interaction.guild;
  const guildIdOpt: string | null = interaction.options.getString('guild_id') ?? null;

  if (guildIdOpt && isDeveloper) {
    const found = client.guilds.cache.get(guildIdOpt);
    if (!found) {
      return sendError(ctx, `No server found with ID \`${guildIdOpt}\`.`);
    }
    guild = found;
  }

  const container = await buildMembercountPayload(guild, interaction.user.username);
  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient): Promise<any> {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');

  const developers: [string, string][] = client.config.developers;
  const isDeveloper = developers.some(([, id]) => id === message.author.id);

  let guild = message.guild;

  if (args.length > 0 && isDeveloper) {
    const guildId = args[0].trim();
    const found = client.guilds.cache.get(guildId);
    if (!found) return sendError({ message }, `No server found with ID \`${guildId}\`.`);
    guild = found;
  }

  const container = await buildMembercountPayload(guild, message.author.username);

  await message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}
