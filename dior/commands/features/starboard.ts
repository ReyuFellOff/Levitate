import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import {
  buildConfigPanel,
  buildStarboardClearCancelledPayload,
  buildStarboardClearConfirmPayload,
  buildStarboardClearErrorPayload,
  buildStarboardClearResultPayload,
  buildStarboardClearTimedOutPayload,
  registerStarboardSession,
} from '../../components/features/starboard.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import { clearStarboardPosts } from '../../helpers/starboard.js';

export const options = {
  name: 'starboard',
  aliases: ['stars'] as string[],
  description: 'Configure a live reaction starboard for your server.',
  usage: `starboard
starboard channel <#channel>
starboard threshold <number>
starboard emoji <emoji>
starboard color <#hex>
starboard ignore <add|remove> <#channel|@role>
starboard config
starboard toggle <on|off>
starboard top
starboard sync [<#channel>]
starboard clear`,
  category: 'features',
  owner: false,
  cooldown: 3,
};

function hasManageGuild(message: any): boolean {
  return !!message.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
}

function channelId(raw: string | undefined): string | null {
  return raw?.match(/^<#(\d+)>$/)?.[1] ?? raw?.match(/^\d{17,20}$/)?.[0] ?? null;
}

function targetId(raw: string | undefined): { type: 'channel' | 'role'; id: string } | null {
  const channel = raw?.match(/^<#(\d+)>$/);
  if (channel) return { type: 'channel', id: channel[1] };
  const role = raw?.match(/^<@&(\d+)>$/);
  if (role) return { type: 'role', id: role[1] };
  return null;
}

function parseColor(raw: string | undefined): number | null {
  if (!raw || !/^#?[0-9a-f]{6}$/i.test(raw)) return null;
  return parseInt(raw.replace('#', ''), 16);
}

export async function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');
  if (!hasManageGuild(message)) return sendError({ message }, 'You need the Manage Server permission to configure starboard.');
  if (!client.db) return sendError({ message }, 'Database is unavailable right now.');

  const guildId = message.guild.id;
  const prefix = client.config.prefix;
  const action = args[0]?.toLowerCase();

  if (!action || action === 'config') {
    const sent = await message.channel.send(buildConfigPanel(
      await client.db.getStarboardSettings(guildId),
      prefix,
    ));
    registerStarboardSession(sent.id, { guildId, channelId: sent.channelId, client });
    return;
  }

  if (action === 'channel') {
    const id = channelId(args[1]);
    const channel = id ? message.guild.channels.cache.get(id) : null;
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      return sendError({ message }, `Provide a valid text channel, for example \`${prefix}starboard channel #stars\`.`);
    }
    const perms = channel.permissionsFor(message.guild.members.me);
    if (!perms?.has?.('ViewChannel') || !perms?.has?.('SendMessages')) {
      return sendError({ message }, 'I need View Channel and Send Messages permissions in that channel.');
    }
    await client.db.setStarboardSettings(guildId, { channel_id: id });
    return sendSuccess({ message }, `Starboard destination set to <#${id}>.`);
  }

  if (action === 'threshold') {
    const value = Number(args[1]);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      return sendError({ message }, 'The threshold must be a whole number from 1 to 100.');
    }
    await client.db.setStarboardSettings(guildId, { threshold: value });
    return sendSuccess({ message }, `Starboard threshold set to **${value}**.`);
  }

  if (action === 'emoji') {
    const value = args.slice(1).join(' ').trim();
    if (!value || value.length > 100 || value.includes('\n')) {
      return sendError({ message }, 'Provide one Unicode or custom Discord emoji.');
    }
    await client.db.setStarboardSettings(guildId, { emoji: value });
    return sendSuccess({ message }, `Starboard emoji set to ${value}.`);
  }

  if (action === 'color') {
    const color = parseColor(args[1]);
    if (color === null) return sendError({ message }, `Provide a six-digit hex color, for example \`${prefix}starboard color #FEE75C\`.`);
    await client.db.setStarboardSettings(guildId, { color });
    return sendSuccess({ message }, `Starboard accent color set to \`#${color.toString(16).padStart(6, '0').toUpperCase()}\`.`);
  }

  if (action === 'toggle') {
    const value = args[1]?.toLowerCase();
    if (value !== 'on' && value !== 'off') return sendError({ message }, `Usage: \`${prefix}starboard toggle <on|off>\``);
    await client.db.setStarboardSettings(guildId, { enabled: value === 'on' });
    return sendSuccess({ message }, `Starboard is now **${value === 'on' ? 'enabled' : 'disabled'}**.`);
  }

  if (action === 'ignore') {
    const mode = args[1]?.toLowerCase();
    const target = targetId(args[2]);
    if ((mode !== 'add' && mode !== 'remove') || !target) {
      return sendError({ message }, `Usage: \`${prefix}starboard ignore <add|remove> <#channel|@role>\``);
    }
    const current = await client.db.getStarboardSettings(guildId);
    const key = target.type === 'channel' ? 'ignored_channel_ids' : 'ignored_role_ids';
    const values = [...(current?.[key] ?? [])];
    const index = values.indexOf(target.id);
    if (mode === 'add' && index === -1) values.push(target.id);
    if (mode === 'remove' && index !== -1) values.splice(index, 1);
    await client.db.setStarboardSettings(guildId, { [key]: values } as any);
    return sendSuccess({ message }, `Starboard ignore list updated for ${target.type} <${target.type === 'channel' ? '#' : '@&'}${target.id}>.`);
  }

  if (action === 'top') {
    const { buildLeaderboardPayload } = await import('../../helpers/starboard.js');
    return message.channel.send(await buildLeaderboardPayload(client, guildId));
  }

  if (action === 'clear') {
    const count = await client.db.countStarboardPosts(guildId);
    if (count === 0) return sendError({ message }, 'There are no tracked starboard messages to clear.');

    const confirmId = `sbcmd:clear-confirm:${message.id}`;
    const cancelId = `sbcmd:clear-cancel:${message.id}`;
    const confirmMsg = await message.channel
      .send(buildStarboardClearConfirmPayload(confirmId, cancelId, count))
      .catch((): null => null);
    if (!confirmMsg) return;

    const collector = confirmMsg.createMessageComponentCollector({
      filter: (i: any) => authorOnlyFilter(
        i,
        message.author.id,
        (customId) => customId === confirmId || customId === cancelId,
      ),
      max: 1,
      time: 30_000,
    });

    collector.on('collect', async (i: any) => {
      await i.deferUpdate().catch((): null => null);
      if (i.customId === confirmId) {
        try {
          const result = await clearStarboardPosts(client, guildId);
          await confirmMsg.edit(buildStarboardClearResultPayload(result)).catch((): null => null);
        } catch (error: unknown) {
          console.error(`[starboard] Clear failed for guild ${guildId}: ${error instanceof Error ? error.message : String(error)}`);
          await confirmMsg.edit(buildStarboardClearErrorPayload()).catch((): null => null);
        }
      } else {
        await confirmMsg.edit(buildStarboardClearCancelledPayload(confirmId, cancelId, count)).catch((): null => null);
      }
    });

    collector.on('end', (_: any, reason: string) => {
      if (reason !== 'time') return;
      confirmMsg.edit(buildStarboardClearTimedOutPayload(confirmId, cancelId, count)).catch((): null => null);
    });
    return;
  }

  if (action === 'sync') {
    const id = channelId(args[1]) ?? message.channelId;
    const channel = message.guild.channels.cache.get(id);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      return sendError({ message }, `Provide a valid text channel, for example \`${prefix}starboard sync #general\`.`);
    }
    const perms = channel.permissionsFor(message.guild.members.me);
    if (!perms?.has?.('ViewChannel') || !perms?.has?.('ReadMessageHistory')) {
      return sendError({ message }, 'I need View Channel and Read Message History permissions in that channel.');
    }
    try {
      const { syncStarboardChannel } = await import('../../helpers/starboard.js');
      const checked = await syncStarboardChannel(channel, client);
      return sendSuccess(
        { message },
        `Scanned the last 100 messages in <#${id}> and checked **${checked}** reaction${checked === 1 ? '' : 's'}.`,
      );
    } catch (error: unknown) {
      console.error(`[starboard] Manual sync failed for ${id}: ${error instanceof Error ? error.message : String(error)}`);
      return sendError({ message }, 'I could not read that channel. Check my View Channel and Read Message History permissions.');
    }
  }

  return sendError({ message }, `Unknown starboard option. Use \`${prefix}starboard config\` to view the setup panel.`);
}