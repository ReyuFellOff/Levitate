// xoxo/components/customisation/customise.ts
//
// Interactive profile customisation panel for $customise / $customize.
//
// Flow:
//   Home → Profile button → modal (Name, Bio, Avatar upload, Banner upload)
//                            submit → back to Home
//          Namestyle button → NS form (inline, replaces this panel)
//          Reset Profile    → confirm step → Confirm / Cancel
//          Done             → disables panel
//
// Session timeout: 10 minutes of inactivity.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  REST,
  Routes,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from 'discord.js';
import { emojis }          from '../../emojis.js';
import { imageUrlToBase64 } from '../../utils/imageUtils.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import {
  buildFormPage as buildNsFormPage,
  registerNsSession,
  type NsSession,
} from '../utility/namestyle.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT_COLOR  = 0xF39399;
const TIMEOUT_MS    = 10 * 60_000; // 10 minutes

// ── Session ───────────────────────────────────────────────────────────────────

export interface CustomiseSession {
  guildId:   string;
  guildName: string;
  authorId:  string;
  channelId: string;
  botMsgId:  string;
  client:    LevitateClient;
  step:      'home' | 'reset-confirm';
}

const sessions = new Map<string, CustomiseSession>();
const timeouts = new Map<string, NodeJS.Timeout>();

export function registerCustomiseSession(scopeId: string, session: CustomiseSession): void {
  sessions.set(scopeId, session);
  resetTimeout(scopeId);
}

function resetTimeout(scopeId: string): void {
  clearTimeout(timeouts.get(scopeId));
  const s = sessions.get(scopeId);
  if (!s) return;
  timeouts.set(scopeId, setTimeout(async () => {
    sessions.delete(scopeId);
    timeouts.delete(scopeId);
    try {
      const ch  = await s.client.channels.fetch(s.channelId) as any;
      const msg = await ch.messages.fetch(s.botMsgId);
      const botDisplayName = await resolveBotDisplayName(s.client, s.guildId);
      const avatarUrl      = await resolveBotAvatarUrl(s.client, s.guildId);
      await msg.edit(buildHomePage(scopeId, s.guildName, botDisplayName, avatarUrl, true));
    } catch { /* message gone */ }
  }, TIMEOUT_MS));
}

function clearSession(scopeId: string): void {
  clearTimeout(timeouts.get(scopeId));
  sessions.delete(scopeId);
  timeouts.delete(scopeId);
}

// ── Custom ID helpers ─────────────────────────────────────────────────────────

export const customiseId = (scopeId: string, ...parts: string[]) =>
  `customise:${scopeId}:${parts.join(':')}`;

// ── CV2 wrapper ───────────────────────────────────────────────────────────────

function wrap(container: ContainerBuilder): any {
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function resolveBotDisplayName(client: LevitateClient, guildId: string): Promise<string> {
  try {
    const guild     = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId);
    const botMember = guild.members.cache.get(client.user!.id)
      ?? await guild.members.fetch(client.user!.id).catch((): null => null);
    return botMember?.nickname ?? client.user?.displayName ?? client.user?.username ?? 'Levitate';
  } catch {
    return client.user?.displayName ?? client.user?.username ?? 'Levitate';
  }
}

export async function resolveBotAvatarUrl(client: LevitateClient, guildId: string): Promise<string | null> {
  try {
    const guild     = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId);
    const botMember = guild.members.cache.get(client.user!.id)
      ?? await guild.members.fetch(client.user!.id).catch((): null => null);
    return botMember?.avatarURL({ size: 128 }) ?? client.user?.avatarURL({ size: 128 }) ?? null;
  } catch {
    return client.user?.avatarURL({ size: 128 }) ?? null;
  }
}

// ── Page builders ─────────────────────────────────────────────────────────────

export function buildHomePage(
  scopeId:        string,
  guildName:      string,
  botDisplayName: string,
  avatarUrl:      string | null,
  disabled  = false,
): any {
  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.whiteButterflies} Customise **${botDisplayName}**`,
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
  );

  const descriptionText =
    `**Profile:** Sculpt this server's version of the bot: tweak its display name, craft its bio, and swap the avatar or banner to match your community perfectly.\n\n` +
    `**Namestyle:** Shape how the bot's name is rendered here; choose from fonts, layered color effects, and rich palettes for a fully bespoke look.\n\n` +
    `**Reset profile:** Wipe every server-specific customisation and restore the bot's global defaults.`;

  if (avatarUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(descriptionText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(descriptionText),
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
  );

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customiseId(scopeId, 'profile'))
        .setLabel('Profile')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(customiseId(scopeId, 'namestyle'))
        .setLabel('Namestyle')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(customiseId(scopeId, 'reset'))
        .setLabel('Reset profile')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(customiseId(scopeId, 'done'))
        .setLabel('Done')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  );

  return wrap(container);
}

function buildResetConfirmPage(
  scopeId:        string,
  botDisplayName: string,
  disabled  = false,
): any {
  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.whiteButterflies} Customise **${botDisplayName}**`,
    ),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: false }),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `Are you sure you want to reset **${botDisplayName}**'s server profile to global defaults?\n` +
      `-# This will clear the server nickname, avatar, banner, and bio.`,
    ),
  );
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customiseId(scopeId, 'reset-confirm'))
        .setLabel('Confirm Reset')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(customiseId(scopeId, 'cancel'))
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  );

  return wrap(container);
}

// ── Profile modal (Name + Bio + Avatar + Banner) ──────────────────────────────
// File upload takes priority over URL if both are provided for the same field.

function makeProfileModal(scopeId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`customise:modal:profile:${scopeId}`)
    .setTitle('Edit Profile')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('cp:name')
          .setLabel('Display Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Leave blank to keep current')
          .setMaxLength(32)
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('cp:bio')
          .setLabel('Bio')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Up to 190 characters (leave blank to keep current)')
          .setMaxLength(190)
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('cp:avatar-url')
          .setLabel('Avatar URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Direct image URL')
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('cp:banner-url')
          .setLabel('Banner URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Direct image URL')
          .setRequired(false),
      ),
    );

  return modal;
}

// ── Modal awaiter ─────────────────────────────────────────────────────────────

function awaitModal(
  client:    LevitateClient,
  customId:  string,
  userId:    string,
  timeoutMs: number,
): Promise<any | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      client.removeListener('interactionCreate', handler);
      resolve(null);
    }, timeoutMs);

    function handler(i: any): void {
      if (i.isModalSubmit?.() && i.customId === customId && i.user?.id === userId) {
        clearTimeout(timer);
        client.removeListener('interactionCreate', handler);
        resolve(i);
      }
    }
    client.on('interactionCreate', handler);
  });
}

// ── Apply profile changes ─────────────────────────────────────────────────────

async function applyProfileChanges(
  guildId: string,
  token:   string,
  fields:  { nick?: string | null; bio?: string | null; avatar?: string | null; banner?: string | null },
): Promise<void> {
  const body: any = {};
  if (fields.nick !== undefined)   body.nick   = fields.nick;
  if (fields.bio !== undefined)    body.bio    = fields.bio;
  if (fields.avatar !== undefined) body.avatar = fields.avatar;
  if (fields.banner !== undefined) body.banner = fields.banner;
  if (Object.keys(body).length === 0) return;
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.patch(Routes.guildMember(guildId, '@me'), { body });
}

// ── Main interaction handler ──────────────────────────────────────────────────

export async function handleCustomiseInteraction(
  interaction: any,
  client:      LevitateClient,
): Promise<void> {
  const parts   = (interaction.customId as string).split(':');
  const scopeId = parts[1];
  const action  = parts[2];

  const session = sessions.get(scopeId);
  if (!session) {
    return interaction.reply({
      content: 'This panel has expired. Run the command again.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
  }

  if (interaction.user?.id !== session.authorId) {
    return interaction.reply({
      content: "This isn't your panel.",
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
  }

  resetTimeout(scopeId);

  // ── Done ──────────────────────────────────────────────────────────────────
  if (action === 'done') {
    clearSession(scopeId);
    const botDisplayName = await resolveBotDisplayName(client, session.guildId);
    const avatarUrl      = await resolveBotAvatarUrl(client, session.guildId);
    await interaction.update(
      buildHomePage(scopeId, session.guildName, botDisplayName, avatarUrl, true),
    ).catch((): null => null);
    return;
  }

  // ── Reset (show confirmation) ─────────────────────────────────────────────
  if (action === 'reset') {
    session.step = 'reset-confirm';
    const botDisplayName = await resolveBotDisplayName(client, session.guildId);
    await interaction.update(buildResetConfirmPage(scopeId, botDisplayName)).catch((): null => null);
    return;
  }

  // ── Reset confirmed ───────────────────────────────────────────────────────
  if (action === 'reset-confirm') {
    await interaction.deferUpdate().catch((): null => null);
    const token = client.config.botToken;
    if (!token) {
      await interaction.followUp({ content: 'Bot token is not configured.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }
    try {
      const rest = new REST({ version: '10' }).setToken(token);
      await rest.patch(Routes.guildMember(session.guildId, '@me'), {
        body: { nick: null, avatar: null, banner: null, bio: null },
      });
    } catch (err: any) {
      console.error('[CUSTOMISE] Reset failed:', err.message);
      await interaction.followUp({
        content: `Failed to reset profile: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      }).catch((): null => null);
      return;
    }
    session.step = 'home';
    await new Promise(r => setTimeout(r, 800));
    const botDisplayName = await resolveBotDisplayName(client, session.guildId);
    const avatarUrl      = await resolveBotAvatarUrl(client, session.guildId);
    await interaction.message.edit(
      buildHomePage(scopeId, session.guildName, botDisplayName, avatarUrl),
    ).catch((): null => null);
    return;
  }

  // ── Cancel / Back → home ──────────────────────────────────────────────────
  if (action === 'cancel') {
    session.step = 'home';
    const botDisplayName = await resolveBotDisplayName(client, session.guildId);
    const avatarUrl      = await resolveBotAvatarUrl(client, session.guildId);
    await interaction.update(
      buildHomePage(scopeId, session.guildName, botDisplayName, avatarUrl),
    ).catch((): null => null);
    return;
  }

  // ── Profile → open unified Edit Profile modal ─────────────────────────────
  if (action === 'profile') {
    const modalId = `customise:modal:profile:${scopeId}`;

    try {
      await interaction.showModal(makeProfileModal(scopeId));
    } catch (err: any) {
      console.error('[CUSTOMISE] showModal failed:', err?.message ?? String(err));
      await interaction.reply({
        content: 'Failed to open the Edit Profile form. Please try again.',
        flags: MessageFlags.Ephemeral,
      }).catch((): null => null);
      return;
    }

    const submit = await awaitModal(client, modalId, session.authorId, 5 * 60_000);
    if (!submit) return; // Modal dismissed / timed out — home page stays visible

    await submit.deferUpdate().catch((): null => null);

    const name      = submit.fields.getTextInputValue('cp:name')?.trim()       || null;
    const bio       = submit.fields.getTextInputValue('cp:bio')?.trim()         || null;
    const avatarUrl = submit.fields.getTextInputValue('cp:avatar-url')?.trim()  || null;
    const bannerUrl = submit.fields.getTextInputValue('cp:banner-url')?.trim()  || null;

    // Nothing provided at all — just refresh home
    if (!name && bio === null && !avatarUrl && !bannerUrl) {
      const botDisplayName = await resolveBotDisplayName(client, session.guildId);
      const freshAvatar    = await resolveBotAvatarUrl(client, session.guildId);
      await submit.message?.edit(
        buildHomePage(scopeId, session.guildName, botDisplayName, freshAvatar),
      ).catch((): null => null);
      return;
    }

    const token = client.config.botToken;
    if (!token) {
      await submit.followUp({ content: 'Bot token is not configured.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }

    const fields: { nick?: string | null; bio?: string | null; avatar?: string | null; banner?: string | null } = {};
    if (name !== null) fields.nick = name;
    if (bio  !== null) fields.bio  = bio;

    // Avatar URL
    if (avatarUrl) {
      try {
        fields.avatar = await imageUrlToBase64(avatarUrl);
      } catch (err: any) {
        console.error('[CUSTOMISE] Avatar URL fetch failed:', err.message);
        await submit.followUp({
          content: `Could not fetch avatar from URL: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        }).catch((): null => null);
      }
    }

    // Banner URL
    if (bannerUrl) {
      try {
        fields.banner = await imageUrlToBase64(bannerUrl);
      } catch (err: any) {
        console.error('[CUSTOMISE] Banner URL fetch failed:', err.message);
        await submit.followUp({
          content: `Could not fetch banner from URL: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        }).catch((): null => null);
      }
    }

    if (Object.keys(fields).length > 0) {
      try {
        await applyProfileChanges(session.guildId, token, fields);
      } catch (err: any) {
        console.error('[CUSTOMISE] Profile apply failed:', err.message);
        await submit.followUp({
          content: `Failed to update profile: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        }).catch((): null => null);
        return;
      }
    }

    await new Promise(r => setTimeout(r, 600));
    const botDisplayName  = await resolveBotDisplayName(client, session.guildId);
    const freshAvatarUrl  = await resolveBotAvatarUrl(client, session.guildId);
    await submit.message?.edit(
      buildHomePage(scopeId, session.guildName, botDisplayName, freshAvatarUrl),
    ).catch((): null => null);
    return;
  }

  // ── Namestyle → show NS form inline on this message ───────────────────────
  if (action === 'namestyle') {
    if (!client.db) {
      await interaction.reply({
        content: 'Database is unavailable right now.',
        flags: MessageFlags.Ephemeral,
      }).catch((): null => null);
      return;
    }

    const nsScopeId = `customise-ns-${scopeId}`;
    const style     = await client.db.getNameStyle(session.guildId).catch((): null => null);

    // Pre-populate NS session with existing style values
    const nsSession: NsSession = {
      guildId:   session.guildId,
      guildName: session.guildName,
      authorId:  session.authorId,
      channelId: session.channelId,
      botMsgId:  interaction.message.id,
      client,
      fontId:    style?.font_id,
      effectId:  style?.effect_id,
      color1:    style?.colors?.[0],
      color2:    style?.colors?.[1],
      // When the user clicks ← Back in the NS form, rebuild the customise home page
      backFn: async (backInteraction: any) => {
        const botDisplayName = await resolveBotDisplayName(client, session.guildId);
        const freshAvatar    = await resolveBotAvatarUrl(client, session.guildId);
        // Re-register a fresh customise session so the home page buttons work again
        registerCustomiseSession(scopeId, {
          guildId:   session.guildId,
          guildName: session.guildName,
          authorId:  session.authorId,
          channelId: session.channelId,
          botMsgId:  interaction.message.id,
          client,
          step:      'home',
        });
        await backInteraction.update(
          buildHomePage(scopeId, session.guildName, botDisplayName, freshAvatar),
        ).catch((): null => null);
      },
    };

    // Clear the customise session and hand control to the NS handler
    clearSession(scopeId);
    await interaction.update(buildNsFormPage(nsScopeId, nsSession)).catch((): null => null);
    registerNsSession(nsScopeId, nsSession);
    return;
  }
}
