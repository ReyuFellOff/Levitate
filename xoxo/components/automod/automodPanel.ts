// xoxo/components/automod/automodPanel.ts
//
// CV2 payload builders and session tracking for the $automod command.
//
// Panel pages:
//   home      — dashboard: status, active modules, buttons
//   configure — module multi-select + punishment + log channel + [Save]
//   badwords  — word list view + [Add] [Clear] + remove select
//   whitelist — user/role/channel add selects + remove select

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import type { AutomodConfigDoc } from '../../database/database.js';
import { automodModules, automodPunishmentLabels, ALL_AUTOMOD_MODULE_KEYS, type AutomodModuleKey, type AutomodPunishment } from '../../config/automodModules.js';
import { emojis } from '../../emojis.js';

const INACTIVITY_MS = 5 * 60 * 1_000;
const NO_MENTIONS   = { parse: [] as any[] };

// ─────────────────────────────────────────────────────────────────────────────
// Session tracking
// ─────────────────────────────────────────────────────────────────────────────

export interface AutomodConfigDraft {
  modules?:        Set<AutomodModuleKey>;
  punishment?:     AutomodPunishment;
  logChannel?:     string | null; // string = set, null = clear
  timeoutDuration?: number;
}

export interface AutomodSession {
  userId:    string;
  guildId:   string;
  channelId: string;
  page:      'home' | 'configure' | 'badwords' | 'whitelist';
  draft:     AutomodConfigDraft;
  client:    LevitateClient;
}

export const automodSessions  = new Map<string, AutomodSession>();
const        automodTimeouts  = new Map<string, NodeJS.Timeout>();

export function registerAutomodSession(msgId: string, session: AutomodSession): void {
  automodSessions.set(msgId, session);
  resetAutomodTimeout(msgId);
}

export function resetAutomodTimeout(msgId: string): void {
  clearTimeout(automodTimeouts.get(msgId));
  const session = automodSessions.get(msgId);
  if (!session) return;

  const timer = setTimeout(async () => {
    try {
      const channel = await session.client.channels.fetch(session.channelId).catch((): null => null);
      const msg     = await (channel as any)?.messages?.fetch(msgId).catch((): null => null);
      if (msg) await msg.edit(buildTimedOutPayload()).catch((): null => null);
    } finally {
      automodSessions.delete(msgId);
      automodTimeouts.delete(msgId);
    }
  }, INACTIVITY_MS);

  automodTimeouts.set(msgId, timer);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function wrap(container: ContainerBuilder): any {
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_MENTIONS };
}

function punishmentDesc(p: AutomodPunishment, timeoutDuration: number): string {
  if (p === 'timeout') return `Timeout (${timeoutDuration}s)`;
  return automodPunishmentLabels[p];
}

function getEnabledModules(config: AutomodConfigDoc): Set<AutomodModuleKey> {
  return new Set(ALL_AUTOMOD_MODULE_KEYS.filter((k) => config.modules[k]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Home / Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export function buildAutomodHomePayload(
  config:  AutomodConfigDoc,
  msgId:   string,
  disabled = false,
): any {
  const enabled      = config.enabled;
  const activeKeys   = ALL_AUTOMOD_MODULE_KEYS.filter((k) => config.modules[k]);
  const activeNames  = activeKeys.map((k) => automodModules.find((m) => m.key === k)!.displayName);
  const wlCount      = config.whitelist?.length ?? 0;
  const bwCount      = config.bad_words?.length ?? 0;

  const statusLine = enabled
    ? `${emojis.greentick} **Active** — ${activeKeys.length}/7 modules on`
    : `${emojis.redcross} **Disabled**`;

  const moduleList = activeNames.length
    ? activeNames.map((n) => `- ${n}`).join('\n')
    : '-# No modules enabled';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${emojis.blackCards} AutoMod\n` +
        `${statusLine}\n\n` +
        `**Modules enabled:**\n${moduleList}\n\n` +
        `-# Punishment: **${punishmentDesc(config.punishment, config.timeout_duration)}** · ` +
        `Log: ${config.log_channel_id ? `<#${config.log_channel_id}>` : 'not set'} · ` +
        `Bad words: **${bwCount}** · Whitelist: **${wlCount}**`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`am:configure:${msgId}`)
          .setLabel('Configure')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`am:thresholds:${msgId}`)
          .setLabel('Thresholds')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`am:badwords:${msgId}`)
          .setLabel(`Bad Words${bwCount ? ` (${bwCount})` : ''}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`am:whitelist:${msgId}`)
          .setLabel(`Whitelist${wlCount ? ` (${wlCount})` : ''}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`am:toggle:${msgId}`)
          .setLabel(enabled ? 'Disable' : 'Enable')
          .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`am:reset:${msgId}`)
          .setLabel('Reset')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Configure panel
// ─────────────────────────────────────────────────────────────────────────────

export function buildAutomodConfigPayload(
  config:  AutomodConfigDoc,
  draft:   AutomodConfigDraft,
  msgId:   string,
): any {
  const effectiveModules    = draft.modules    ?? getEnabledModules(config);
  const effectivePunishment = draft.punishment ?? config.punishment;
  const effectiveLogChannel = draft.logChannel !== undefined ? draft.logChannel : config.log_channel_id;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# AutoMod — Configure\n` +
        `-# Select your modules, punishment, and log channel. Hit **Save** when done.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Active modules** (${effectiveModules.size}/7):\n` +
        (effectiveModules.size
          ? [...effectiveModules].map((k) => `- ${automodModules.find((m) => m.key === k)!.displayName}`).join('\n')
          : '-# None selected'),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`am:cfg-modules:${msgId}`)
          .setPlaceholder('Select modules to enable (pick multiple)')
          .setMinValues(0)
          .setMaxValues(automodModules.length)
          .setOptions(
            automodModules.map((m) =>
              new StringSelectMenuOptionBuilder()
                .setValue(m.key)
                .setLabel(m.displayName)
                .setDescription(m.description)
                .setDefault(effectiveModules.has(m.key)),
            ),
          ),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Punishment** — ${punishmentDesc(effectivePunishment, draft.timeoutDuration ?? config.timeout_duration)}\n` +
        (effectivePunishment === 'timeout'
          ? `-# Timeout duration is set in **Thresholds**`
          : ''),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`am:cfg-punishment:${msgId}`)
          .setPlaceholder('Select punishment')
          .setOptions([
            { label: 'Delete Message',  value: 'delete',  description: 'Silently delete the offending message.', default: effectivePunishment === 'delete'  },
            { label: 'Warn (DM)',       value: 'warn',    description: 'Delete + DM the user a warning.',         default: effectivePunishment === 'warn'    },
            { label: 'Timeout',         value: 'timeout', description: 'Delete + timeout the user.',              default: effectivePunishment === 'timeout' },
            { label: 'Kick',            value: 'kick',    description: 'Delete + kick the user.',                 default: effectivePunishment === 'kick'    },
            { label: 'Ban',             value: 'ban',     description: 'Delete + ban the user.',                  default: effectivePunishment === 'ban'     },
          ]),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Log Channel** — ${effectiveLogChannel ? `<#${effectiveLogChannel}>` : 'not set'}\n` +
        `-# AutoMod actions will be posted here.`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`am:cfg-logchannel:${msgId}`)
          .setPlaceholder('Select log channel (or skip to keep current)')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`am:cfg-save:${msgId}`).setLabel('Save').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`am:home:${msgId}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds modal
// ─────────────────────────────────────────────────────────────────────────────

export function buildAutomodThresholdsModal(config: AutomodConfigDoc, msgId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`am-modal:thresholds:${msgId}`)
    .setTitle('AutoMod Thresholds')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('spam_threshold')
          .setLabel('Spam: messages before trigger (e.g. 5)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.spam_threshold ?? 5))
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('spam_interval')
          .setLabel('Spam: rolling window in seconds (e.g. 5)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.spam_interval ?? 5))
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('mention_limit')
          .setLabel('Max mentions per message (e.g. 5)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.mention_limit ?? 5))
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('caps_percentage')
          .setLabel('Caps: min % to flag (e.g. 70 = 70%)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.caps_percentage ?? 70))
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('timeout_duration')
          .setLabel('Timeout duration in seconds (e.g. 300)')
          .setStyle(TextInputStyle.Short)
          .setValue(String(config.timeout_duration ?? 300))
          .setRequired(true),
      ),
    ) as unknown as ModalBuilder;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bad words panel
// ─────────────────────────────────────────────────────────────────────────────

export function buildAutomodBadWordsPayload(
  config:  AutomodConfigDoc,
  msgId:   string,
  confirmClear = false,
): any {
  const words   = config.bad_words ?? [];
  const wordText = words.length
    ? '`' + words.slice(0, 60).join('`, `') + '`' + (words.length > 60 ? `\n-# …and ${words.length - 60} more` : '')
    : '-# No bad words added yet.';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# AutoMod — Bad Words (${words.length})\n` +
        `-# Words are matched case-insensitively anywhere in the message.\n\n` +
        wordText,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }));

  if (confirmClear) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emojis.redcross} **Are you sure?** This will remove all ${words.length} words.`),
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`am:bw-clear-confirm:${msgId}`).setLabel('Yes, clear all').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`am:badwords:${msgId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      ),
    );
  } else {
    if (words.length > 0) {
      const removeOptions = words.slice(0, 25).map((w) =>
        new StringSelectMenuOptionBuilder().setValue(w).setLabel(w.length > 100 ? w.slice(0, 97) + '…' : w),
      );
      container.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`am:bw-remove:${msgId}`)
            .setPlaceholder('Select words to remove (pick multiple)')
            .setMinValues(1)
            .setMaxValues(Math.min(words.length, 25))
            .addOptions(removeOptions),
        ),
      );
    }
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`am:bw-add:${msgId}`).setLabel('Add Words').setStyle(ButtonStyle.Secondary),
        ...(words.length ? [
          new ButtonBuilder().setCustomId(`am:bw-clear:${msgId}`).setLabel('Clear All').setStyle(ButtonStyle.Danger),
        ] : []),
        new ButtonBuilder().setCustomId(`am:home:${msgId}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Add words modal
// ─────────────────────────────────────────────────────────────────────────────

export function buildAutomodAddWordsModal(msgId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`am-modal:bw-add:${msgId}`)
    .setTitle('Add Bad Words')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('words')
          .setLabel('Words to add (comma or newline separated)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('badword1, badword2\nbadword3')
          .setRequired(true)
          .setMaxLength(2000),
      ),
    ) as unknown as ModalBuilder;
}

// ─────────────────────────────────────────────────────────────────────────────
// Whitelist panel
// ─────────────────────────────────────────────────────────────────────────────

export async function buildAutomodWhitelistPayload(
  config:  AutomodConfigDoc,
  msgId:   string,
  guild:   any,
): Promise<any> {
  const entries = config.whitelist ?? [];

  // Resolve display names
  const lines: string[] = [];
  for (const entry of entries.slice(0, 30)) {
    if (entry.type === 'user') {
      lines.push(`- <@${entry.id}> (user)`);
    } else if (entry.type === 'role') {
      lines.push(`- <@&${entry.id}> (role)`);
    } else {
      lines.push(`- <#${entry.id}> (channel)`);
    }
  }
  if (entries.length > 30) lines.push(`-# …and ${entries.length - 30} more`);

  const entryText = lines.length ? lines.join('\n') : '-# No whitelist entries yet.';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# AutoMod — Whitelist (${entries.length})\n` +
        `-# Whitelisted users, roles, and channels are never checked by AutoMod.\n\n` +
        entryText,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Add to whitelist:**`),
    )
    .addActionRowComponents(
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`am:wl-user:${msgId}`)
          .setPlaceholder('Add a user to the whitelist'),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`am:wl-role:${msgId}`)
          .setPlaceholder('Add a role to the whitelist'),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`am:wl-channel:${msgId}`)
          .setPlaceholder('Add a channel to the whitelist')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice),
      ),
    );

  // Remove select (if there are entries)
  if (entries.length > 0) {
    const removeOptions = entries.slice(0, 25).map((entry) => {
      let label: string;
      if (entry.type === 'user')    label = `User: ${entry.id}`;
      else if (entry.type === 'role') label = `Role: ${entry.id}`;
      else                          label = `Channel: ${entry.id}`;
      return new StringSelectMenuOptionBuilder()
        .setValue(`${entry.type}:${entry.id}`)
        .setLabel(label);
    });
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`am:wl-remove:${msgId}`)
          .setPlaceholder('Remove entries from whitelist (pick one or many)')
          .setMinValues(1)
          .setMaxValues(Math.min(entries.length, 25))
          .addOptions(removeOptions),
      ),
    );
  }

  // Back button row
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`am:home:${msgId}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
    ),
  );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset confirm
// ─────────────────────────────────────────────────────────────────────────────

export function buildAutomodResetConfirmPayload(msgId: string): any {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.redcross} Reset AutoMod?\n` +
        `This will disable automod, clear all modules, bad words, the whitelist, and log channel for this server.\n\n` +
        `-# This cannot be undone.`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`am:reset-confirm:${msgId}`).setLabel('Yes, reset everything').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`am:home:${msgId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      ),
    );
  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Timed-out / disabled payload
// ─────────────────────────────────────────────────────────────────────────────

export function buildTimedOutPayload(): any {
  return wrap(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# AutoMod panel expired due to inactivity.'),
    ),
  );
}
