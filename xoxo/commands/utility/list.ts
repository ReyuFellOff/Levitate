// xoxo/commands/utility/list.ts
//
// $list — paginated server entity listing.
//
// Usage:
//   $list roles    — list all roles
//   $list members  — list all members (cache only)
//   $list emojis   — list all emojis
//   $list stickers — list all stickers
//   $list channels — list all channels
//   $list bans     — list all bans
//
// Alias: $ls

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildListPayload,
  fetchListItems,
  registerListSession,
  type ListType,
} from '../../components/utility/list.js';

export const options = {
  name:        'list',
  aliases:     ['ls'] as string[],
  description: 'Paginated list of server roles, members, bots, boosters, emojis, stickers, channels, bans, or invites.',
  usage:       'list <roles | members | bots | boosters | emojis | stickers | channels | bans | invites>',
  category:    'utility',
  owner:       false,
  cooldown:    5,
};

const VALID_TYPES: Record<string, ListType> = {
  roles:    'roles',
  role:     'roles',
  members:  'members',
  member:   'members',
  users:    'members',
  user:     'members',
  bots:     'bots',
  bot:      'bots',
  boosters: 'boosters',
  booster:  'boosters',
  emojis:   'emojis',
  emoji:    'emojis',
  stickers: 'stickers',
  sticker:  'stickers',
  channels: 'channels',
  channel:  'channels',
  bans:     'bans',
  ban:      'bans',
  invites:  'invites',
  invite:   'invites',
  inv:      'invites',
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const rawType = args[0]?.toLowerCase().trim();
  if (!rawType || !VALID_TYPES[rawType]) {
    return sendError(
      ctx,
      `Specify what to list: **roles**, **members**, **bots**, **emojis**, **stickers**, **channels**, or **bans**.\n-# Usage: \`${client.config.prefix}${options.usage}\``,
    );
  }

  const listType = VALID_TYPES[rawType];

  // Permission checks
  if (listType === 'bans') {
    const canBan = message.member?.permissions?.has?.('BanMembers');
    if (!canBan) return sendError(ctx, 'You need **Ban Members** permission to view the ban list.');
  }

  await message.channel.sendTyping?.().catch((): null => null);

  const items = await fetchListItems(guild, listType);

  if (!items.length) {
    return sendError(ctx, `This server has no **${listType}** to display.`);
  }

  const session: import('../../components/utility/list.js').ListSession = {
    userId:    message.author.id,
    channelId: message.channelId,
    guildId:   guild.id,
    listType,
    items,
    page:      0,
    detailId:  null as string | null,
    client,
  };

  const payload = buildListPayload(session);
  const sent    = await message.channel.send(payload).catch((): null => null);
  if (!sent) return;

  registerListSession(sent.id, session);
}

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const guild = interaction.guild;
  if (!guild) return sendError({ interaction }, 'This command can only be used in a server.');

  const rawType = (interaction.options.getString('type') as string)?.toLowerCase();
  if (!rawType || !VALID_TYPES[rawType]) {
    return interaction.editReply({
      content: 'Specify what to list: **roles**, **members**, **bots**, **emojis**, **stickers**, **channels**, or **bans**.',
    });
  }

  const listType = VALID_TYPES[rawType];

  if (listType === 'bans') {
    const canBan = interaction.member?.permissions?.has?.('BanMembers');
    if (!canBan) {
      return interaction.editReply({ content: 'You need **Ban Members** permission to view the ban list.' });
    }
  }

  const items = await fetchListItems(guild, listType);

  if (!items.length) {
    return interaction.editReply({ content: `This server has no **${listType}** to display.` });
  }

  const session: import('../../components/utility/list.js').ListSession = {
    userId:    interaction.user.id,
    channelId: interaction.channelId,
    guildId:   guild.id,
    listType,
    items,
    page:      0,
    detailId:  null as string | null,
    client,
  };

  const payload = buildListPayload(session);
  await interaction.editReply(payload);

  // Slash replies don't give us the message ID directly for session registration
  // — we need to fetch the reply message after editReply resolves.
  try {
    const msg = await interaction.fetchReply();
    registerListSession(msg.id, session);
  } catch { /* ignore — session just won't persist across edits, list still works once */ }
}
