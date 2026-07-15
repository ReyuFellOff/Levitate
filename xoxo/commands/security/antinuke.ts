// xoxo/commands/antinuke/antinuke.ts
//
// Configure the antinuke system for this server.
//
// Prefix: $antinuke                                          — home panel
//         $antinuke enable | disable                         — master switch
//         $antinuke status                                    — detailed status
//         $antinuke config                                   — interactive config panel
//         $antinuke modules                                  — interactive modules panel
//         $antinuke module <name> enable|disable              — toggle one module
//         $antinuke module <name> punishment <type>           — set punishment
//         $antinuke module <name> threshold <count>           — set action limit
//         $antinuke module <name> info                        — module detail
//         $antinuke profiles                                  — list all pre-made profiles
//         $antinuke profile <name>                            — apply a pre-made profile
//         $antinuke whitelist                                 — interactive whitelist panel
//         $antinuke whitelist add|remove <@user|@role>        — manage trust list
//         $antinuke whitelist list                            — static whitelist view
//         $antinuke logs <#channel> | disable                 — alert log channel
//         $antinuke quarantine-role <@role>                   — custom jail role
//         $antinuke reset                                     — wipe config (confirm)
//         $antinuke help                                      — full command reference

import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess, sendInfo } from '../../components/statusMessages.js';
import {
  buildAntinukeHomePayload,
  buildAntinukeStatusPayload,
  buildAntinukeModuleInfoPayload,
  buildAntinukeHelpPayload,
  buildAntinukeProfilesPayload,
  buildAntinukeProfileAppliedPayload,
  // Config panel
  buildAntinukeConfigContainer,
  buildAntinukeConfigSavedPayload,
  buildAntinukeConfigTimedOutPayload,
  buildAntinukeConfigCancelledPayload,
  // Modules panel
  buildAntinukeModulesContainer,
  buildAntinukeModulesSavedPayload,
  buildAntinukeModulesTimedOutPayload,
  // Whitelist panel
  buildAntinukeWhitelistContainer,
  buildAntinukeWhitelistInspectContainer,
  buildAntinukeWhitelistTimedOutPayload,
} from '../../components/antinuke/antinuke.js';
import {
  buildActionConfirmPayload,
  buildActionCancelledPayload,
  buildActionTimedOutPayload,
} from '../../components/purgeConfirm.js';
import {
  antinukeModules,
  resolveAntinukeModuleKey,
  resolveAntinukePunishment,
  getAntinukeModuleInfo,
  resolveAntinukeProfile,
} from '../../config/antinukeModules.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import type { AntinukeModuleKey, AntinukePunishment, AntinukeWhitelistType } from '../../database/database.js';

export const options = {
  name: 'antinuke',
  aliases: ['an', 'antinukesetup'] as string[],
  description: 'Configure the antinuke protection system for this server.',
  usage: 'antinuke [status|enable|disable|config|modules|module|profiles|profile|whitelist|logs|quarantine-role|reset|help]',
  category: 'security',
  owner: false,
  cooldown: 3,
};

function parseChannelId(raw: string): string | null {
  const mentionMatch = raw.match(/^<#(\d+)>$/);
  return mentionMatch?.[1] ?? (/^\d{17,20}$/.test(raw) ? raw : null);
}

function parseRoleId(raw: string): string | null {
  const mentionMatch = raw.match(/^<@&(\d+)>$/);
  return mentionMatch?.[1] ?? (/^\d{17,20}$/.test(raw) ? raw : null);
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!message.member?.permissions?.has?.(PermissionFlagsBits.Administrator))
    return sendError(ctx, 'You need the **Administrator** permission to configure antinuke.');

  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

  const guild  = message.guild;
  const prefix = client.config.prefix;
  const sub    = args[0]?.toLowerCase();

  // ── Home panel (no args) ────────────────────────────────────────────────────
  if (!sub) {
    const config = await client.db.getAntinukeConfig(guild.id);
    const botUser = await client.users.fetch(client.user!.id, { force: true }).catch(() => client.user!);
    const bannerUrl =
      (botUser as any).bannerURL?.({ size: 1024, forceStatic: false }) ||
      botUser.displayAvatarURL({ size: 1024 });
    const invokerAvatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 256 });
    return message.channel.send(buildAntinukeHomePayload(config, prefix, bannerUrl, invokerAvatarUrl));
  }

  if (sub === 'help') {
    return message.channel.send(buildAntinukeHelpPayload(prefix));
  }

  // ── Status ──────────────────────────────────────────────────────────────────
  if (sub === 'status') {
    const config = await client.db.getAntinukeConfig(guild.id);
    return message.channel.send(buildAntinukeStatusPayload(config, prefix));
  }

  // ── Master switch ───────────────────────────────────────────────────────────
  if (sub === 'enable' || sub === 'disable') {
    const enabled = sub === 'enable';
    await client.db.setAntinukeEnabled(guild.id, enabled);
    return sendSuccess(
      ctx,
      `Antinuke has been **${enabled ? 'enabled' : 'disabled'}**.${
        enabled ? ` Set a log channel with \`${prefix}antinuke logs #channel\` if you haven't already.` : ''
      }`,
    );
  }

  // ── Pre-made profiles list ──────────────────────────────────────────────────
  if (sub === 'profiles') {
    return message.channel.send(buildAntinukeProfilesPayload(prefix));
  }

  // ── Apply a pre-made profile ────────────────────────────────────────────────
  if (sub === 'profile') {
    const rawProfile = args[1];
    if (!rawProfile) {
      return message.channel.send(buildAntinukeProfilesPayload(prefix));
    }

    const profile = resolveAntinukeProfile(rawProfile);
    if (!profile) {
      return sendError(
        ctx,
        `Unknown profile \`${rawProfile}\`. Run \`${prefix}antinuke profiles\` to see available options.`,
      );
    }

    await client.db.applyAntinukeProfileSettings(guild.id, profile.modules, profile.enablesAntinuke);
    const newConfig = await client.db.getAntinukeConfig(guild.id);
    return message.channel.send(buildAntinukeProfileAppliedPayload(profile, newConfig, prefix));
  }

  // ── Interactive config panel ────────────────────────────────────────────────
  if (sub === 'config') {
    const config = await client.db.getAntinukeConfig(guild.id);

    const punishmentCounts: Record<string, number> = {};
    for (const mod of antinukeModules) {
      const p = config.modules[mod.key]?.punishment ?? 'ban';
      punishmentCounts[p] = (punishmentCounts[p] ?? 0) + 1;
    }
    const currentPunishment = (Object.entries(punishmentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ban') as AntinukePunishment;

    const token = `${message.id}-${Date.now()}`;
    const cfgContainer = buildAntinukeConfigContainer(currentPunishment, config.log_channel_id, token);

    const response = await message.channel.send({
      components: [cfgContainer],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });

    let selectedPunishment: AntinukePunishment = currentPunishment;
    let selectedLogChannel: string | null = null;

    const collector = response.createMessageComponentCollector({
      filter: (i: any) => {
        if (!i.customId.endsWith(`:${token}`)) return false;
        if (i.user.id !== message.author.id) {
          i.reply({ content: 'This config panel is not for you.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return false;
        }
        return true;
      },
      time: 120_000,
    });

    collector.on('collect', async (i: any) => {
      if (i.isStringSelectMenu() && i.customId.startsWith('ancfg-punishment:')) {
        selectedPunishment = i.values[0] as AntinukePunishment;
        await i.deferUpdate().catch((): null => null);
      } else if (i.isChannelSelectMenu() && i.customId.startsWith('ancfg-logchannel:')) {
        selectedLogChannel = i.values[0] ?? null;
        await i.deferUpdate().catch((): null => null);
      } else if (i.isButton() && i.customId.startsWith('ancfg-save:')) {
        await i.deferUpdate().catch((): null => null);
        collector.stop('saved');
        const freshConfig = await client.db!.getAntinukeConfig(guild.id);
        for (const mod of antinukeModules) {
          if (freshConfig.modules[mod.key] && mod.allowedPunishments.includes(selectedPunishment)) {
            await client.db!.setAntinukeModulePunishment(guild.id, mod.key, selectedPunishment).catch((): null => null);
          }
        }
        if (selectedLogChannel) {
          await client.db!.setAntinukeLogChannel(guild.id, selectedLogChannel).catch((): null => null);
        }
        const invokerAvatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 256 });
        await response.edit(buildAntinukeConfigSavedPayload(selectedPunishment, selectedLogChannel, invokerAvatarUrl)).catch((): null => null);
      } else if (i.isButton() && i.customId.startsWith('ancfg-cancel:')) {
        await i.deferUpdate().catch((): null => null);
        collector.stop('cancelled');
        await response.edit(buildAntinukeConfigCancelledPayload()).catch((): null => null);
      }
    });

    collector.on('end', async (_: any, reason: string) => {
      if (reason === 'time') {
        await response.edit(buildAntinukeConfigTimedOutPayload()).catch((): null => null);
      }
    });

    return;
  }

  // ── Interactive modules panel ───────────────────────────────────────────────
  if (sub === 'modules') {
    const config = await client.db.getAntinukeConfig(guild.id);
    const token = `${message.id}-${Date.now()}`;

    let proposedState: Record<AntinukeModuleKey, boolean> = Object.fromEntries(
      antinukeModules.map((info) => [info.key, config.modules[info.key]?.enabled !== false]),
    ) as Record<AntinukeModuleKey, boolean>;

    const response = await message.channel.send({
      components: [buildAntinukeModulesContainer(config, token, 'panel', proposedState)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });

    const collector = response.createMessageComponentCollector({
      filter: (i: any) => {
        if (!i.customId.endsWith(`:${token}`)) return false;
        if (i.user.id !== message.author.id) {
          i.reply({ content: 'This module panel is not for you.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return false;
        }
        return true;
      },
      time: 120_000,
    });

    collector.on('collect', async (i: any) => {
      if (i.isStringSelectMenu() && i.customId.startsWith('anmod-select:')) {
        const selected = new Set<string>(i.values);
        proposedState = Object.fromEntries(
          antinukeModules.map((info) => [info.key, selected.has(info.key)]),
        ) as Record<AntinukeModuleKey, boolean>;
        await i.update({
          components: [buildAntinukeModulesContainer(config, token, 'confirm', proposedState)],
          flags: MessageFlags.IsComponentsV2,
        }).catch((): null => null);
      } else if (i.isButton() && i.customId.startsWith('anmod-enableall:')) {
        proposedState = Object.fromEntries(
          antinukeModules.map((info) => [info.key, true]),
        ) as Record<AntinukeModuleKey, boolean>;
        await i.update({
          components: [buildAntinukeModulesContainer(config, token, 'confirm', proposedState)],
          flags: MessageFlags.IsComponentsV2,
        }).catch((): null => null);
      } else if (i.isButton() && i.customId.startsWith('anmod-cancel:')) {
        await i.update({
          components: [buildAntinukeModulesContainer(config, token, 'panel', proposedState)],
          flags: MessageFlags.IsComponentsV2,
        }).catch((): null => null);
      } else if (i.isButton() && i.customId.startsWith('anmod-confirm:')) {
        collector.stop('saved');
        for (const [key, enabled] of Object.entries(proposedState) as [AntinukeModuleKey, boolean][]) {
          await client.db!.setAntinukeModuleEnabled(guild.id, key, enabled).catch((): null => null);
        }
        await i.update(buildAntinukeModulesSavedPayload(proposedState)).catch((): null => null);
      }
    });

    collector.on('end', async (_: any, reason: string) => {
      if (reason === 'time') {
        await response.edit(buildAntinukeModulesTimedOutPayload()).catch((): null => null);
      }
    });

    return;
  }

  // ── Single module config ────────────────────────────────────────────────────
  if (sub === 'module') {
    const rawName = args[1];
    if (!rawName) return sendError(ctx, `**Usage:** \`${prefix}antinuke module <name> enable|disable|punishment <type>|threshold <count>|info\``);

    const moduleKey = resolveAntinukeModuleKey(rawName);
    if (!moduleKey) return sendError(ctx, `Unknown module \`${rawName}\`. Run \`${prefix}antinuke modules\` to see valid names.`);

    const action = args[2]?.toLowerCase();
    const info = getAntinukeModuleInfo(moduleKey)!;

    if (!action || action === 'info') {
      const config = await client.db.getAntinukeConfig(guild.id);
      return message.channel.send(buildAntinukeModuleInfoPayload(config, moduleKey, prefix));
    }

    if (action === 'enable' || action === 'disable') {
      await client.db.setAntinukeModuleEnabled(guild.id, moduleKey, action === 'enable');
      return sendSuccess(ctx, `**${info.displayName}** module ${action === 'enable' ? 'enabled' : 'disabled'}.`);
    }

    if (action === 'punishment') {
      const rawPunishment = args[3];
      if (!rawPunishment) return sendError(ctx, `**Usage:** \`${prefix}antinuke module ${rawName} punishment <ban|kick|strip|quarantine|none>\``);
      const punishment = resolveAntinukePunishment(rawPunishment);
      if (!punishment) return sendError(ctx, `Unknown punishment \`${rawPunishment}\`. Valid options: ban, kick, strip, quarantine, none.`);
      if (!info.allowedPunishments.includes(punishment))
        return sendError(ctx, `**${info.displayName}** does not support the \`${punishment}\` punishment. Allowed: ${info.allowedPunishments.join(', ')}.`);
      await client.db.setAntinukeModulePunishment(guild.id, moduleKey, punishment);
      return sendSuccess(ctx, `**${info.displayName}** punishment set to **${punishment}**.`);
    }

    if (action === 'threshold') {
      if (!info.thresholdBased)
        return sendError(ctx, `**${info.displayName}** always fires on the first action — it does not use a threshold.`);
      const rawCount = args[3];
      if (!rawCount) return sendError(ctx, `**Usage:** \`${prefix}antinuke module ${rawName} threshold <count>\`\n-# Sets how many actions are needed to trip this module (minimum 1).`);
      const count = parseInt(rawCount, 10);
      if (isNaN(count) || count < 1 || count > 50)
        return sendError(ctx, `Threshold must be a whole number between **1** and **50**.`);
      // Keep interval_ms as 10 000 (stored for compat; not used at runtime)
      await client.db.setAntinukeModuleThreshold(guild.id, moduleKey, count, 10_000);
      return sendSuccess(
        ctx,
        `**${info.displayName}** threshold set to **${count}** action${count !== 1 ? 's' : ''}.\n` +
        `-# The module will now trip after **${count}** matching action${count !== 1 ? 's' : ''} within the 5-minute tracking window.`,
      );
    }

    return sendError(ctx, `Unknown action \`${action}\`. Use enable, disable, punishment, threshold, or info.`);
  }

  // ── Interactive whitelist panel ─────────────────────────────────────────────
  if (sub === 'whitelist' || sub === 'wl') {
    const action = args[1]?.toLowerCase();

    if (!action || action === 'panel') {
      const config = await client.db.getAntinukeConfig(guild.id);
      const token = `${message.id}-${Date.now()}`;
      let page = 0;

      const getConfig = () => client.db!.getAntinukeConfig(guild.id);

      const response = await message.channel.send({
        components: [buildAntinukeWhitelistContainer(config, page, token)],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });

      const collector = response.createMessageComponentCollector({
        filter: (i: any) => {
          if (!i.customId.endsWith(`:${token}`)) return false;
          if (i.user.id !== message.author.id) {
            i.reply({ content: 'This whitelist panel is not for you.', flags: MessageFlags.Ephemeral }).catch((): null => null);
            return false;
          }
          return true;
        },
        time: 120_000,
      });

      collector.on('collect', async (i: any) => {
        try {
          if (i.customId.startsWith('anwl-prev:')) {
            if (page > 0) page--;
            const cfg = await getConfig();
            await i.update({ components: [buildAntinukeWhitelistContainer(cfg, page, token)], flags: MessageFlags.IsComponentsV2 }).catch((): null => null);
          } else if (i.customId.startsWith('anwl-next:')) {
            page++;
            const cfg = await getConfig();
            await i.update({ components: [buildAntinukeWhitelistContainer(cfg, page, token)], flags: MessageFlags.IsComponentsV2 }).catch((): null => null);
          } else if (i.customId.startsWith('anwl-refresh:')) {
            const cfg = await getConfig();
            await i.update({ components: [buildAntinukeWhitelistContainer(cfg, page, token)], flags: MessageFlags.IsComponentsV2 }).catch((): null => null);
          } else if (i.isStringSelectMenu() && i.customId.startsWith('anwl-select:')) {
            const userId = i.values[0];
            const cfg = await getConfig();
            const entry = cfg.whitelist.find((w) => w.id === userId);
            if (!entry) { await i.deferUpdate().catch((): null => null); return; }
            await i.update({ components: [buildAntinukeWhitelistInspectContainer(entry, token)], flags: MessageFlags.IsComponentsV2 }).catch((): null => null);
          } else if (i.customId.startsWith('anwl-back:')) {
            const cfg = await getConfig();
            await i.update({ components: [buildAntinukeWhitelistContainer(cfg, page, token)], flags: MessageFlags.IsComponentsV2 }).catch((): null => null);
          }
        } catch {
          await i.deferUpdate().catch((): null => null);
        }
      });

      collector.on('end', async (_: any, reason: string) => {
        if (reason === 'time') {
          await response.edit(buildAntinukeWhitelistTimedOutPayload()).catch((): null => null);
        }
      });

      return;
    }

    if (action === 'list') {
      const config = await client.db.getAntinukeConfig(guild.id);
      const token = `view-${message.id}`;
      return message.channel.send({
        components: [buildAntinukeWhitelistContainer(config, 0, token)],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }

    if (action === 'add' || action === 'remove') {
      const raw = args[2];
      if (!raw) return sendError(ctx, `**Usage:** \`${prefix}antinuke whitelist ${action} <@user|@role|user_id>\``);

      let type: AntinukeWhitelistType;
      let id: string | null;

      const roleId = parseRoleId(raw);
      if (roleId) {
        type = 'role';
        id = roleId;
      } else {
        const user = await resolveUser(client, guild, raw);
        if (!user) return sendError(ctx, `Could not find a user or role matching \`${raw}\`.`);
        type = user.bot ? 'bot' : 'user';
        id = user.id;
      }

      if (action === 'add') {
        const result = await client.db.addAntinukeWhitelistEntry(guild.id, type, id, message.author.id);
        if (result === 'duplicate') return sendInfo(ctx, `That ${type} is already whitelisted.`);
        return sendSuccess(ctx, `Added <${type === 'role' ? '@&' : '@'}${id}> to the antinuke whitelist.`);
      }

      const removed = await client.db.removeAntinukeWhitelistEntry(guild.id, type, id);
      if (!removed) return sendError(ctx, `That ${type} was not on the whitelist.`);
      return sendSuccess(ctx, `Removed <${type === 'role' ? '@&' : '@'}${id}> from the antinuke whitelist.`);
    }

    return sendError(ctx, `**Usage:** \`${prefix}antinuke whitelist [panel|list|add|remove <@user|@role>]\``);
  }

  // ── Log channel ─────────────────────────────────────────────────────────────
  if (sub === 'logs' || sub === 'log') {
    const raw = args[1];
    if (!raw) return sendError(ctx, `**Usage:** \`${prefix}antinuke logs <#channel>\` or \`${prefix}antinuke logs disable\``);

    if (raw.toLowerCase() === 'disable') {
      await client.db.setAntinukeLogChannel(guild.id, null);
      return sendSuccess(ctx, 'Antinuke log alerts disabled.');
    }

    const channelId = parseChannelId(raw);
    if (!channelId) return sendError(ctx, `\`${raw}\` is not a recognised channel.`);

    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch((): null => null);
    if (!channel || !channel.isTextBased?.()) return sendError(ctx, 'Channel not found or is not a text channel.');

    await client.db.setAntinukeLogChannel(guild.id, channelId);
    return sendSuccess(ctx, `Antinuke alert log channel set to <#${channelId}>.`);
  }

  // ── Quarantine role ──────────────────────────────────────────────────────────
  if (sub === 'quarantine-role' || sub === 'quarantinerole') {
    const raw = args[1];
    if (!raw) return sendError(ctx, `**Usage:** \`${prefix}antinuke quarantine-role <@role>\` or \`${prefix}antinuke quarantine-role reset\``);

    if (raw.toLowerCase() === 'reset') {
      await client.db.setAntinukeQuarantineRole(guild.id, null);
      return sendSuccess(ctx, 'Quarantine role reset — a new one will be auto-created the next time it is needed.');
    }

    const roleId = parseRoleId(raw);
    if (!roleId) return sendError(ctx, `\`${raw}\` is not a recognised role.`);

    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch((): null => null);
    if (!role) return sendError(ctx, 'Role not found.');

    await client.db.setAntinukeQuarantineRole(guild.id, roleId);
    return sendSuccess(ctx, `Quarantine role set to <@&${roleId}>.`);
  }

  // ── Reset (destructive) ─────────────────────────────────────────────────────
  if (sub === 'reset') {
    const confirmId = `an-reset-confirm-${message.id}`;
    const cancelId  = `an-reset-cancel-${message.id}`;
    const desc = 'This will disable antinuke, clear the whitelist, remove the log channel, and restore every module to its default settings.';

    const confirmMsg = await message.channel.send(buildActionConfirmPayload(confirmId, cancelId, 'Reset Antinuke Config', desc));

    const collector = confirmMsg.createMessageComponentCollector({
      filter: (i: any) => authorOnlyFilter(
        i, message.author.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
      max: 1,
      time: 30_000,
    });

    collector.on('collect', async (i: any) => {
      await i.deferUpdate().catch((): null => null);
      if (i.customId === confirmId) {
        await client.db!.resetAntinukeConfig(guild.id);
        await confirmMsg.delete().catch((): null => null);
        await sendSuccess(ctx, 'Antinuke configuration has been reset to defaults.');
      } else {
        await confirmMsg.edit(buildActionCancelledPayload(confirmId, cancelId, 'Reset Antinuke Config', desc)).catch((): null => null);
      }
    });

    collector.on('end', async (collected: any) => {
      if (collected.size === 0) {
        await confirmMsg.edit(buildActionTimedOutPayload(confirmId, cancelId, 'Reset Antinuke Config', desc)).catch((): null => null);
      }
    });

    return;
  }

  return sendError(ctx, `Unknown subcommand \`${sub}\`. Run \`${prefix}antinuke help\` for the full command list.`);
}
