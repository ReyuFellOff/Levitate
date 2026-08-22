import { config } from '../../config.js';
// xoxo/commands/developer/fixbotroles.ts
//
// Developer-only command. Renames the bot's own managed integration role in
// every guild to the current `client.config.botName` (e.g. "Levitate"). Useful
// after a rebrand when old servers still have the role under the previous name
// (e.g. "Roxanne").
//
// The bot's managed role is located via `guild.members.me.roles.botRole` (the
// role created by Discord for the bot integration). Renaming requires the bot
// to have the ManageRoles permission in that guild. Renames are processed
// sequentially with a short delay to avoid tripping global rate limits.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';

export const options = {
  name:        'fixbotroles',
  aliases:     ['fixbotrole', 'renamebotrole'] as string[],
  description: "Rename the bot's managed role to the current bot name in all servers.",
  usage:       'fixbotroles',
  category:    'developer',
  owner:       true,
  cooldown:    0,
};

function buildResultPayload(
  botName: string,
  total: number,
  renamed: number,
  alreadyCorrect: number,
  noPermission: number,
  failed: number,
  failedGuilds: string[],
): any {
  const lines = [
    `**Target name:** \`${botName}\``,
    `**Servers scanned:** ${total}`,
    `${emojis.blacktick} **Renamed:** ${renamed}`,
    `${emojis.whiteArrow} **Already correct:** ${alreadyCorrect}`,
    `${emojis.whiteArrow} **No ManageRoles permission:** ${noPermission}`,
    `${emojis.redcross} **Failed:** ${failed}`,
  ];

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.info} Bot Role Rename Report`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n')),
    );

  if (failedGuilds.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Failed guilds:\n${failedGuilds.slice(0, 10).join('\n')}${failedGuilds.length > 10 ? `\n-# …and ${failedGuilds.length - 10} more` : ''}`,
      ),
    );
  }

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export async function prefixExecute(
  message: any,
  _args: string[],
  client: LevitateClient,
): Promise<any> {
  if (!client.config.developers.some(([, id]) => id === message.author.id)) {
    return sendError({ message }, 'This command is for bot developers only.');
  }

  const botName = client.config.botName;
  const guilds = [...client.guilds.cache.values()];

  let renamed = 0;
  let alreadyCorrect = 0;
  let noPermission = 0;
  let failed = 0;
  const failedGuilds: string[] = [];

  // Sequential processing with a short delay to avoid rate-limiting
  for (const guild of guilds) {
    const botMember = guild.members.me;
    if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
      noPermission++;
      continue;
    }

    const botRole = botMember.roles?.botRole;
    if (!botRole) {
      failed++;
      failedGuilds.push(`- ${guild.name} (${guild.id}) — no managed role found`);
      continue;
    }

    if (botRole.name === botName) {
      alreadyCorrect++;
      continue;
    }

    // Discord's API rejects edits to any role at or above the bot's highest
    // role position. If the managed role IS the bot's highest role (no one
    // gave it a regular role ranked higher), renaming will always fail.
    if (botRole.position >= botMember.roles.highest.position) {
      failed++;
      failedGuilds.push(
        `- ${guild.name} (${guild.id}) — managed role is at the bot's ceiling; give the bot a higher regular role or Administrator`,
      );
      continue;
    }

    let renameError: string | null = null;
    const ok = await botRole
      .setName(botName, `Renamed by ${message.author.username} via fixbotroles`)
      .then(() => true)
      .catch((err: any) => {
        renameError = err?.message ?? String(err);
        console.error(`[fixbotroles] failed to rename role in ${guild.id}: ${renameError}`);
        return false;
      });

    if (ok) {
      renamed++;
    } else {
      failed++;
      failedGuilds.push(`- ${guild.name} (${guild.id}) — ${renameError ?? 'unknown error'}`);
    }

    // Small delay between edits to stay rate-limit friendly
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  await message.channel.send(
    buildResultPayload(
      botName,
      guilds.length,
      renamed,
      alreadyCorrect,
      noPermission,
      failed,
      failedGuilds,
    ),
  );
}
