import { config as botConfig } from '../../config.js';
// xoxo/components/antinuke/antinuke.ts
//
// CV2 payload builders for the antinuke command family.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import type { AntinukeConfigDoc, AntinukeModuleKey, AntinukePunishment } from '../../database/database.js';
import { emojis } from '../../emojis.js';
import {
  antinukeModules,
  antinukeProfiles,
  antinukePunishmentLabels,
  getAntinukeModuleInfo,
  type AntinukeProfile,
} from '../../config/antinuke/antinukeModules.js';

const NO_MENTIONS = { parse: [] as any[] };

function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: NO_MENTIONS,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Home panel
// ─────────────────────────────────────────────────────────────────────────────

export function buildAntinukeHomePayload(
  config: AntinukeConfigDoc,
  prefix: string,
  bannerUrl: string,
  invokerAvatarUrl: string,
): any {
  const enabledModules = antinukeModules.filter((info) => config.modules[info.key]?.enabled !== false).length;
  const totalModules = antinukeModules.length;

  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16));

  container.addMediaGalleryComponents(
    new MediaGalleryBuilder({ items: [{ media: { url: bannerUrl } }] }),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# Security Center\n` +
      `Automated server protection. Monitors and mitigates threats in real time.\n\n` +
      `-# Status: **${config.enabled ? 'Active' : 'Disabled'}** — ${enabledModules}/${totalModules} modules enabled`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### Commands\n` +
          `\`${prefix}antinuke enable\` — Enable protection\n` +
          `\`${prefix}antinuke disable\` — Disable protection\n` +
          `\`${prefix}antinuke config\` — Configure global settings\n` +
          `\`${prefix}antinuke modules\` — Toggle modules\n` +
          `\`${prefix}antinuke profiles\` — Browse pre-made profiles\n` +
          `\`${prefix}antinuke whitelist\` — Manage whitelist\n` +
          `\`${prefix}antinuke status\` — Detailed status`,
        ),
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder({ media: { url: invokerAvatarUrl } }),
      ),
  );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Config panel  (global punishment + log channel)
// ─────────────────────────────────────────────────────────────────────────────

export function buildAntinukeConfigContainer(
  currentPunishment: AntinukePunishment,
  currentLogChannelId: string | null,
  token: string,
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# Antinuke Config`),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder({ spacing: SeparatorSpacingSize.Large, divider: true }),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Global Punishment**\n-# Applies to all modules at once — use \`module <name> punishment\` to set per-module`,
    ),
  );
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ancfg-punishment:${token}`)
        .setPlaceholder('Select punishment')
        .setOptions([
          { label: 'Ban', value: 'ban', description: 'Permanently ban the offender', default: currentPunishment === 'ban' },
          { label: 'Kick', value: 'kick', description: 'Kick the offender from the server', default: currentPunishment === 'kick' },
          { label: 'Quarantine', value: 'quarantine', description: 'Isolate the offender with a quarantine role', default: currentPunishment === 'quarantine' },
          { label: 'Strip Roles', value: 'strip', description: 'Remove all roles from the offender', default: currentPunishment === 'strip' },
          { label: 'Log Only', value: 'none', description: 'Do not punish — only log the action', default: currentPunishment === 'none' },
        ]),
    ),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Log Channel**\n-# Where antinuke alerts are sent${currentLogChannelId ? ` — currently <#${currentLogChannelId}>` : ''}`,
    ),
  );
  container.addActionRowComponents(
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`ancfg-logchannel:${token}`)
        .setPlaceholder('Select log channel')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
  );
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ancfg-save:${token}`)
        .setLabel('Save')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ancfg-cancel:${token}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return container;
}

export function buildAntinukeConfigSavedPayload(
  punishment: AntinukePunishment,
  logChannelId: string | null,
  invokerAvatarUrl: string,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# Config Saved`),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# **Punishment**: ${antinukePunishmentLabels[punishment]}\n` +
            `-# **Log Channel**: ${logChannelId ? `<#${logChannelId}>` : 'Not changed'}`,
          ),
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: invokerAvatarUrl } })),
    );

  return wrap(container);
}

export function buildAntinukeConfigTimedOutPayload(): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Config panel timed out.'),
    ),
  );
}

export function buildAntinukeConfigCancelledPayload(): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Configuration cancelled.'),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modules panel
// ─────────────────────────────────────────────────────────────────────────────

function buildModulesSummary(state: Record<AntinukeModuleKey, boolean>): string {
  return antinukeModules
    .map((info) => `- **${info.displayName}**: ${state[info.key] ? 'Enabled' : 'Disabled'}`)
    .join('\n');
}

export function buildAntinukeModulesContainer(
  config: AntinukeConfigDoc,
  token: string,
  mode: 'panel' | 'confirm' = 'panel',
  proposedState?: Record<AntinukeModuleKey, boolean>,
): ContainerBuilder {
  const state: Record<AntinukeModuleKey, boolean> = proposedState ??
    (Object.fromEntries(
      antinukeModules.map((info) => [info.key, config.modules[info.key]?.enabled !== false]),
    ) as Record<AntinukeModuleKey, boolean>);

  const enabledCount = Object.values(state).filter(Boolean).length;

  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# Antinuke Modules\n` +
        `-# Select which modules to keep enabled. Changes are saved only after confirmation.\n\n` +
        `Enabled: **${enabledCount}/${antinukeModules.length}**`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildModulesSummary(state)))
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }));

  if (mode === 'confirm') {
    container
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Confirm Module Changes\n-# Review the state above, then save or cancel.`,
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`anmod-confirm:${token}`)
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`anmod-cancel:${token}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    return container;
  }

  container
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`anmod-select:${token}`)
          .setPlaceholder('Select enabled modules')
          .setMinValues(0)
          .setMaxValues(antinukeModules.length)
          .setOptions(
            antinukeModules.map((info) => ({
              label: info.displayName,
              description: info.description.slice(0, 100),
              value: info.key,
              default: state[info.key],
            })),
          ),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`anmod-enableall:${token}`)
          .setLabel('Enable All')
          .setStyle(ButtonStyle.Secondary),
      ),
    );

  return container;
}

export function buildAntinukeModulesSavedPayload(state: Record<AntinukeModuleKey, boolean>): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# Modules Saved\n-# Antinuke module settings were updated.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildModulesSummary(state)));

  return wrap(container);
}

export function buildAntinukeModulesTimedOutPayload(): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Module panel timed out.'),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Whitelist panel
// ─────────────────────────────────────────────────────────────────────────────

const WL_PER_PAGE = 5;

export function buildAntinukeWhitelistContainer(
  config: AntinukeConfigDoc,
  page: number,
  token: string,
): ContainerBuilder {
  const entries = config.whitelist;
  const totalPages = Math.max(1, Math.ceil(entries.length / WL_PER_PAGE));
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = entries.slice(currentPage * WL_PER_PAGE, (currentPage + 1) * WL_PER_PAGE);

  const listText = slice.length
    ? slice
        .map((w) => {
          const mention = w.type === 'role' ? `<@&${w.id}>` : `<@${w.id}>`;
          const typeLabel = w.type === 'bot' ? 'Bot' : w.type === 'role' ? 'Role' : 'User';
          return `**${typeLabel}** — ${mention} — added by <@${w.added_by}>`;
        })
        .join('\n')
    : 'No whitelist entries yet.';

  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Antinuke Whitelist\n` +
        `-# ${entries.length} total entr${entries.length === 1 ? 'y' : 'ies'} — Page ${currentPage + 1}/${totalPages}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(listText))
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }));

  const selectableEntries = slice.filter((w) => w.type === 'user' || w.type === 'bot');
  if (selectableEntries.length > 0) {
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`anwl-select:${token}`)
          .setPlaceholder('Select an entry to inspect')
          .setOptions(
            selectableEntries.slice(0, 25).map((w) => ({
              label: w.id,
              description: `${w.type === 'bot' ? 'Bot' : 'User'} — added by ${w.added_by}`,
              value: w.id,
            })),
          ),
      ),
    );
  }

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`anwl-prev:${token}`)
        .setLabel('← Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId(`anwl-next:${token}`)
        .setLabel('Next →')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(`anwl-refresh:${token}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return container;
}

export function buildAntinukeWhitelistInspectContainer(
  entry: AntinukeConfigDoc['whitelist'][0],
  token: string,
): ContainerBuilder {
  const mention = entry.type === 'role' ? `<@&${entry.id}>` : `<@${entry.id}>`;
  const typeLabel = entry.type === 'bot' ? 'Bot' : entry.type === 'role' ? 'Role' : 'User';

  return new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Whitelist Entry\n` +
        `**Type**: ${typeLabel}\n` +
        `**ID**: ${mention} (\`${entry.id}\`)\n` +
        `**Added by**: <@${entry.added_by}>`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`anwl-back:${token}`)
          .setLabel('← Back')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
}

export function buildAntinukeWhitelistTimedOutPayload(): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Whitelist panel timed out.'),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status panel  (detailed — shows per-module threshold + punishment)
// ─────────────────────────────────────────────────────────────────────────────

export function buildAntinukeStatusPayload(config: AntinukeConfigDoc, prefix: string): any {
  const enabledModules = antinukeModules.filter((info) => config.modules[info.key]?.enabled !== false).length;
  const totalModules = antinukeModules.length;

  const moduleLines = antinukeModules
    .map((info) => {
      const cfg = config.modules[info.key];
      const on = cfg?.enabled !== false;
      const limitStr = info.thresholdBased ? ` · limit ${cfg?.limit ?? '?'}` : ' · instant';
      const punishStr = antinukePunishmentLabels[cfg?.punishment ?? 'kick'];
      return `${on ? emojis.greentick : emojis.redcross} **${info.displayName}** — ${punishStr}${limitStr}`;
    })
    .join('\n');

  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# Antinuke Status`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `**Status**: ${config.enabled ? 'Enabled' : 'Disabled'}`,
          `**Log channel**: ${config.log_channel_id ? `<#${config.log_channel_id}>` : 'Not set'}`,
          `**Quarantine role**: ${config.quarantine_role_id ? `<@&${config.quarantine_role_id}>` : 'Auto-created when needed'}`,
          `**Whitelist entries**: ${config.whitelist.length}`,
          `**Modules**: ${enabledModules}/${totalModules} active`,
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Modules\n${moduleLines}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `-# \`${prefix}antinuke config\` — global settings`,
          `-# \`${prefix}antinuke modules\` — toggle modules`,
          `-# \`${prefix}antinuke module <name> threshold <n>\` — set trigger count`,
          `-# \`${prefix}antinuke profiles\` — pre-made profiles`,
        ].join('\n'),
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Module info panel  (one specific module)
// ─────────────────────────────────────────────────────────────────────────────

export function buildAntinukeModuleInfoPayload(
  config: AntinukeConfigDoc,
  moduleKey: AntinukeModuleKey,
  prefix: string,
): any {
  const info = getAntinukeModuleInfo(moduleKey)!;
  const cfg = config.modules[moduleKey];
  const on = cfg?.enabled !== false;

  const thresholdLine = info.thresholdBased
    ? `**Threshold**: ${cfg?.limit ?? 2} action${(cfg?.limit ?? 2) !== 1 ? 's' : ''} within 5 minutes`
    : `**Threshold**: Instant — fires on the first action, no accumulation`;

  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${info.displayName}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          info.description,
          '',
          `**Status**: ${on ? 'Enabled' : 'Disabled'}`,
          `**Punishment**: ${antinukePunishmentLabels[cfg?.punishment ?? 'kick']}`,
          thresholdLine,
          `**Revert**: ${info.revertBehaviour}`,
          `**Allowed punishments**: ${info.allowedPunishments.map((p) => antinukePunishmentLabels[p]).join(', ')}`,
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `-# \`${prefix}antinuke module ${moduleKey} enable|disable\``,
          `-# \`${prefix}antinuke module ${moduleKey} punishment <ban|kick|strip|quarantine|none>\``,
          info.thresholdBased ? `-# \`${prefix}antinuke module ${moduleKey} threshold <count>\`` : '',
        ].filter(Boolean).join('\n'),
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Profiles panel
// ─────────────────────────────────────────────────────────────────────────────

export function buildAntinukeProfilesPayload(prefix: string): any {
  const profileLines = antinukeProfiles
    .map((p) => [
      `### ${p.displayName}`,
      p.description,
      `-# Apply: \`${prefix}antinuke profile ${p.id}\``,
    ].join('\n'))
    .join('\n\n');

  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# Antinuke Profiles`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Profiles are pre-configured antinuke setups that apply sensible punishment and threshold values across all modules at once.\n\n` +
        `${profileLines}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# After applying a profile you can still fine-tune individual modules with \`${prefix}antinuke module <name> punishment|threshold\`.`,
      ),
    );

  return wrap(container);
}

export function buildAntinukeProfileAppliedPayload(
  profile: AntinukeProfile,
  config: AntinukeConfigDoc,
  prefix: string,
): any {
  const moduleLines = antinukeModules
    .map((info) => {
      const override = profile.modules[info.key];
      const punishStr = antinukePunishmentLabels[override?.punishment ?? 'kick'];
      const limitStr = info.thresholdBased ? ` · limit ${override?.limit ?? '?'}` : ' · instant';
      return `- **${info.displayName}** — ${punishStr}${limitStr}`;
    })
    .join('\n');

  const logNote = config.log_channel_id
    ? ''
    : `\n\n-# No log channel is set. Use \`${prefix}antinuke logs #channel\` to receive alerts.`;

  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# Profile Applied — ${profile.displayName}\n` +
        `-# ${profile.description}${profile.enablesAntinuke ? '\n-# Antinuke was enabled automatically.' : ''}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Module Settings\n${moduleLines}${logNote}`),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Help panel
// ─────────────────────────────────────────────────────────────────────────────

export function buildAntinukeHelpPayload(prefix: string): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Antinuke Commands`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `\`${prefix}antinuke\` — home panel`,
          `\`${prefix}antinuke enable\` / \`disable\` — master switch`,
          `\`${prefix}antinuke status\` — detailed status (per-module settings)`,
          `\`${prefix}antinuke config\` — set global punishment + log channel`,
          `\`${prefix}antinuke modules\` — toggle modules with multi-select`,
          `\`${prefix}antinuke module <name> enable|disable\` — toggle one module`,
          `\`${prefix}antinuke module <name> punishment <ban|kick|strip|quarantine|none>\``,
          `\`${prefix}antinuke module <name> threshold <count>\` — set action limit (1–50)`,
          `\`${prefix}antinuke module <name> info\` — full detail on one module`,
          `\`${prefix}antinuke profiles\` — browse pre-made profiles`,
          `\`${prefix}antinuke profile <name>\` — apply a profile (lockdown|strict|balanced|lenient)`,
          `\`${prefix}antinuke whitelist\` — interactive whitelist panel`,
          `\`${prefix}antinuke whitelist add <@user|@role>\``,
          `\`${prefix}antinuke whitelist remove <@user|@role>\``,
          `\`${prefix}antinuke logs <#channel>\` — set alert log channel`,
          `\`${prefix}antinuke logs disable\` — stop sending alerts`,
          `\`${prefix}antinuke quarantine-role <@role>\``,
          `\`${prefix}antinuke reset\` — reset all settings to defaults`,
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Requires the **Administrator** permission.',
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Antinuke trigger log  (sent to log channel when a module fires)
// ─────────────────────────────────────────────────────────────────────────────

export function buildAntinukeTriggerContainer(
  moduleName: string,
  executorId: string,
  executorAvatarUrl: string,
  actionDescription: string,
  punishmentResult: string,
  revertedCount: number,
  revertFailures: number,
): ContainerBuilder {
  const timestamp = `<t:${Math.floor(Date.now() / 1000)}:F>`;

  const container = new ContainerBuilder().setAccentColor(parseInt(botConfig.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Anti-Nuke Response\n-# Automated protection triggered`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ◆  EXECUTOR\n<@${executorId}>`),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(executorAvatarUrl)),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ◆  MODULE\n\`${moduleName}\``),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ◆  ACTION\n> ${actionDescription}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
    );

  const punishLines = [`-# ◆  PUNISHMENT\n> ${punishmentResult}`];
  if (revertedCount > 0 || revertFailures > 0) {
    punishLines.push(`> Reverted: ${revertedCount}${revertFailures ? ` (${revertFailures} failed)` : ''}`);
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(punishLines.join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ◆  TIMESTAMP\n-# ${timestamp}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ▸ Anti-Nuke Recovery System Active`),
    );

  return container;
}
