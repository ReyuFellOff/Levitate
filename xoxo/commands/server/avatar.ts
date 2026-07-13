// xoxo/commands/server/avatar.ts
//
// View a user's, the bot's, or the server's avatar.
//
// Prefix usage:
//   avatar            — your own avatar
//   avatar @user      — another user
//   avatar bot        — bot's avatar
//   avatar server     — server icon

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';
import {
  buildChoicePayload,
  buildTimedOutChoicePayload,
  type MediaType,
} from '../../components/avatarBanner.js';
import { sendImagePanel } from '../../helpers/imagePanel.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';

// Shared helpers used by both prefix and slash executes
function avatarTitleShared(displayName: string, variant: 'global' | 'server'): string {
  return `${displayName}'s ${variant === 'server' ? 'Server' : 'Global'} Avatar`;
}

async function sendWithChoiceShared(
  channel: any,
  sendChoiceMsg: ((payload: any) => Promise<any>) | null,
  displayName: string,
  requesterId: string,
  getUrl: (type: 'server' | 'global') => string | null,
  type: MediaType,
): Promise<void> {
  const choicePayload = buildChoicePayload(displayName, type);
  let promptMsg: any;
  if (sendChoiceMsg) {
    promptMsg = await sendChoiceMsg(choicePayload).catch((): null => null);
  } else {
    promptMsg = await channel.send(choicePayload).catch((): null => null);
  }
  if (!promptMsg) return;

  const collector = promptMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
      i, requesterId,
      (cid) => cid === `choice:server_${type}` || cid === `choice:global_${type}`,
    ),
    time: 60_000,
    max: 1,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    const chosen = i.customId === `choice:server_${type}` ? 'server' : 'global';
    const url = getUrl(chosen);
    if (!url) return;
    const title = avatarTitleShared(displayName, chosen);
    await promptMsg.delete().catch((): null => null);
    await sendImagePanel({ channel, sendAsReply: null, title, imageUrl: url, requesterId, idPrefix: 'av' });
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      await promptMsg.edit(buildTimedOutChoicePayload(displayName, type)).catch((): null => null);
    }
  });
}

export const options = {
  name: 'avatar',
  aliases: ['av', 'pfp'] as string[],
  description: "View a user's, the bot's, or the server's avatar.",
  usage: `avatar
  avatar @user
  avatar <user ID>
  avatar bot
  avatar server`,
  category: 'server',
  owner: false,
  cooldown: 3,
};

const TYPE: MediaType = 'avatar';

function avatarTitle(displayName: string, variant: 'global' | 'server'): string {
  return `${displayName}'s ${variant === 'server' ? 'Server' : 'Global'} Avatar`;
}

async function sendWithChoice(
  channel: any,
  sendChoiceMsg: ((payload: any) => Promise<any>) | null,
  displayName: string,
  requesterId: string,
  getUrl: (type: 'server' | 'global') => string | null,
): Promise<any> {
  const choicePayload = buildChoicePayload(displayName, TYPE);

  let promptMsg: any;
  if (sendChoiceMsg) {
    promptMsg = await sendChoiceMsg(choicePayload).catch((): null => null);
  } else {
    promptMsg = await channel.send(choicePayload).catch((): null => null);
  }
  if (!promptMsg) return;

  const collector = promptMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
      i, requesterId,
      (cid) => cid === `choice:server_${TYPE}` || cid === `choice:global_${TYPE}`,
    ),
    time: 60_000,
    max: 1,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    const chosen = i.customId === `choice:server_${TYPE}` ? 'server' : 'global';
    const url = getUrl(chosen);
    if (!url) return;
    const title = avatarTitle(displayName, chosen);
    await promptMsg.delete().catch((): null => null);
    await sendImagePanel({ channel, sendAsReply: null, title, imageUrl: url, requesterId, idPrefix: 'av' });
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      await promptMsg.edit(buildTimedOutChoicePayload(displayName, TYPE)).catch((): null => null);
    }
  });
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient): Promise<any> {
  const guild = message.guild;
  const requesterId: string = message.author.id;
  const channel = message.channel;

  if (!guild) return sendError({ message }, 'This command can only be used in a server.');

  if (!args.length) {
    const user = await client.users.fetch(message.author.id, { force: true });
    const member = await guild.members.fetch({ user: user.id, force: true }).catch((): null => null);
    const hasServerAvatar = !!(member?.avatar);
    const globalUrl: string = user.displayAvatarURL({ size: 4096 });
    const serverUrl: string | null = member ? member.displayAvatarURL({ size: 4096 }) : null;

    if (hasServerAvatar && serverUrl) {
      return sendWithChoice(channel, null, user.username, requesterId, (t) =>
        t === 'server' ? serverUrl : globalUrl,
      );
    }
    return sendImagePanel({ channel, sendAsReply: null, title: avatarTitle(user.username, 'global'), imageUrl: globalUrl, requesterId, idPrefix: 'av' });
  }

  const firstArg = args[0].toLowerCase();

  if (firstArg === 'server' || firstArg === 'srv') {
    const iconUrl = guild.iconURL({ size: 4096 });
    if (!iconUrl) return sendError({ message }, 'This server does not have an icon.');
    return sendImagePanel({ channel, sendAsReply: null, title: "Server's Icon", imageUrl: iconUrl, requesterId, idPrefix: 'av' });
  }

  if (firstArg === 'bot') {
    const botUser = await client.users.fetch(client.user!.id, { force: true });
    const botMember = await guild.members.fetch({ user: client.user!.id, force: true }).catch((): null => null);
    const hasServerAvatar = !!(botMember?.avatar);
    const globalUrl: string = botUser.displayAvatarURL({ size: 4096 });
    const serverUrl: string | null = botMember ? botMember.displayAvatarURL({ size: 4096 }) : null;

    if (hasServerAvatar && serverUrl) {
      return sendWithChoice(channel, null, 'Bot', requesterId, (t) =>
        t === 'server' ? serverUrl : globalUrl,
      );
    }
    return sendImagePanel({ channel, sendAsReply: null, title: avatarTitle('Bot', 'global'), imageUrl: globalUrl, requesterId, idPrefix: 'av' });
  }

  const targetUser = await resolveUser(client, guild, args[0]);
  if (!targetUser) return sendError({ message }, 'User not found. Try: mention, user ID, or username.');

  const fullUser = await client.users.fetch(targetUser.id, { force: true });
  const member = await guild.members.fetch({ user: fullUser.id, force: true }).catch((): null => null);
  const hasServerAvatar = !!(member?.avatar);
  const globalUrl: string = fullUser.displayAvatarURL({ size: 4096 });
  const serverUrl: string | null = member ? member.displayAvatarURL({ size: 4096 }) : null;

  if (hasServerAvatar && serverUrl) {
    return sendWithChoice(channel, null, fullUser.username, requesterId, (t) =>
      t === 'server' ? serverUrl : globalUrl,
    );
  }
  return sendImagePanel({ channel, sendAsReply: null, title: avatarTitle(fullUser.username, 'global'), imageUrl: globalUrl, requesterId, idPrefix: 'av' });
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();

  const guild = interaction.guild;
  const requesterId: string = interaction.user.id;
  const channel = interaction.channel;
  const targetOption: any = interaction.options.getUser('user') ?? null;
  const specialArg: string | null = interaction.options.getString('target') ?? null;

  const sendFirst = (payload: any) => interaction.editReply(payload);

  if (!guild) return sendError({ interaction }, 'This command can only be used in a server.');

  if (specialArg === 'server') {
    const iconUrl = guild.iconURL({ size: 4096 });
    if (!iconUrl) return sendError({ interaction }, 'This server does not have an icon.');
    return sendImagePanel({ channel, sendAsReply: sendFirst, title: "Server's Icon", imageUrl: iconUrl, requesterId, idPrefix: 'av' });
  }

  if (specialArg === 'bot') {
    const botUser = await client.users.fetch(client.user!.id, { force: true });
    const botMember = await guild.members.fetch({ user: client.user!.id, force: true }).catch((): null => null);
    const hasServerAvatar = !!(botMember?.avatar);
    const globalUrl: string = botUser.displayAvatarURL({ size: 4096 });
    const serverUrl: string | null = botMember ? botMember.displayAvatarURL({ size: 4096 }) : null;

    if (hasServerAvatar && serverUrl) {
      return sendWithChoice(channel, sendFirst, 'Bot', requesterId, (t) =>
        t === 'server' ? serverUrl : globalUrl,
      );
    }
    return sendImagePanel({ channel, sendAsReply: sendFirst, title: avatarTitle('Bot', 'global'), imageUrl: globalUrl, requesterId, idPrefix: 'av' });
  }

  const rawUser = targetOption ?? interaction.user;
  const fullUser = await client.users.fetch(rawUser.id, { force: true });
  const member = await guild.members.fetch({ user: fullUser.id, force: true }).catch((): null => null);
  const hasServerAvatar = !!(member?.avatar);
  const globalUrl: string = fullUser.displayAvatarURL({ size: 4096 });
  const serverUrl: string | null = member ? member.displayAvatarURL({ size: 4096 }) : null;

  if (hasServerAvatar && serverUrl) {
    return sendWithChoice(channel, sendFirst, fullUser.username, requesterId, (t) =>
      t === 'server' ? serverUrl : globalUrl,
    );
  }
  return sendImagePanel({ channel, sendAsReply: sendFirst, title: avatarTitle(fullUser.username, 'global'), imageUrl: globalUrl, requesterId, idPrefix: 'av' });
}
