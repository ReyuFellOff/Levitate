// xoxo/components/utility/autoresponder.ts
//
// CV2 payload builders + the interactive management panel for the
// autoresponder system. Follows the antinuke/container self-contained
// collector pattern: the command file opens the panel and this file exposes
// pure builders plus entry points (`runAutoresponderManagePanel`,
// `runAutoresponderHomePanel`) that own their own MessageComponentCollector
// and a local modal-submit listener — no global `interactionCreate` routing.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from '../../config.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import type {
  AutoresponderDoc,
  AutoresponderMatchType,
  AutoresponderReplyMode,
  AutoresponderResponseAction,
  AutoresponderResponseType,
} from '../../database/database.js';
import { emojis } from '../../emojis.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';

const NO_MENTIONS = { parse: [] as any[] };
const MAX_PER_GUILD = 25;
const HOME_PAGE_SIZE = 6;

function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: NO_MENTIONS,
  };
}

function replyModeLabel(mode: AutoresponderReplyMode | undefined): string {
  if (mode === 'reply_mention') return 'reply (ping)';
  if (mode === 'reply_no_mention') return 'reply (no ping)';
  return 'normal';
}

export function responseLine(r: AutoresponderResponseAction, i: number): string {
  if (r.type === 'message') {
    const mode = r.replyMode && r.replyMode !== 'normal' ? ` (${replyModeLabel(r.replyMode)})` : '';
    const preview = r.content.length > 70 ? `${r.content.slice(0, 70)}…` : r.content;
    return `**${i + 1}.** Message${mode} — ${preview}`;
  }
  return `**${i + 1}.** Reaction — ${r.content}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Home panel (interactive, paged)
// ─────────────────────────────────────────────────────────────────────────────

export function buildAutoresponderHomePayload(
  docs: AutoresponderDoc[],
  prefix: string,
  page: number,
  statusNote?: string,
): any {
  const totalPages = Math.max(1, Math.ceil(docs.length / HOME_PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1);
  const slice = docs.slice(clampedPage * HOME_PAGE_SIZE, clampedPage * HOME_PAGE_SIZE + HOME_PAGE_SIZE);

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));

  const headerNote = statusNote ? `\n-# ${statusNote}` : '';
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# Autoresponder\n` +
      `Automatically react or reply when specific words are said.\n\n` +
      `-# ${docs.length}/${MAX_PER_GUILD} triggers configured — Page ${clampedPage + 1}/${totalPages}` +
      headerNote,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (docs.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `No triggers set up yet.\nPress **Create New** to create your first trigger.`,
      ),
    );
  } else {
    const lines = slice.map((d) => {
      const status = d.enabled ? emojis.greentick : emojis.redcross;
      const scope = d.match_type === 'exact' ? 'exact match' : 'anywhere';
      const globalTag = d.is_global ? ' 🌐' : '';
      return `${status} \`${d.trigger}\` — ${scope} — ${d.responses.length} response${d.responses.length === 1 ? '' : 's'}${globalTag}`;
    });
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  // Trigger select menu (only show when there are triggers)
  if (slice.length > 0) {
    const homeToken = `home-${Date.now()}`;
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ar-home-select:${homeToken}`)
          .setPlaceholder('Manage a trigger…')
          .addOptions(
            slice.map((d) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(d.trigger.length > 100 ? d.trigger.slice(0, 97) + '…' : d.trigger)
                .setDescription(
                  `${d.enabled ? 'Enabled' : 'Disabled'} · ${d.match_type === 'exact' ? 'Exact' : 'Anywhere'} · ${d.responses.length} response${d.responses.length === 1 ? '' : 's'} · ID: ${d.ar_id ?? '—'}`
                    .slice(0, 100),
                )
                .setValue(d.trigger_lower),
            ),
          ),
      ),
    );
  }

  // Prev/Next + Create New buttons
  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ar-home-prev:${clampedPage}`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clampedPage === 0),
    new ButtonBuilder()
      .setCustomId(`ar-home-next:${clampedPage}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clampedPage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`ar-home-create`)
      .setLabel('Create New')
      .setStyle(ButtonStyle.Success)
      .setDisabled(docs.length >= MAX_PER_GUILD),
  );
  container.addActionRowComponents(btnRow);

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Use \`${prefix}autoresponder add <trigger>\` to create a new trigger, or select one above to manage it.`,
    ),
  );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// List panel (paginated, static — kept for $ar list subcommand)
// ─────────────────────────────────────────────────────────────────────────────

const LIST_PAGE_SIZE = 10;

export function buildAutoresponderListPayload(docs: AutoresponderDoc[], page: number, prefix: string): any {
  const totalPages = Math.max(1, Math.ceil(docs.length / LIST_PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1);
  const slice = docs.slice(clampedPage * LIST_PAGE_SIZE, clampedPage * LIST_PAGE_SIZE + LIST_PAGE_SIZE);

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# Autoresponder Triggers\n-# Page ${clampedPage + 1}/${totalPages} — ${docs.length} total`),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (slice.length === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('No triggers set up yet.'));
  } else {
    const lines = slice.map((d) => {
      const status = d.enabled ? emojis.greentick : emojis.redcross;
      const scope = d.match_type === 'exact' ? 'exact match' : 'anywhere';
      const globalTag = d.is_global ? ' 🌐' : '';
      const arId = d.ar_id ? ` \`${d.ar_id}\`` : '';
      return `${status} \`${d.trigger}\` — ${scope} — ${d.responses.length} response${d.responses.length === 1 ? '' : 's'}${globalTag}${arId}`;
    });
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Use \`${prefix}autoresponder edit <trigger>\` to manage a trigger`),
  );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Info panel (static, read-only)
// ─────────────────────────────────────────────────────────────────────────────

export function buildAutoresponderInfoPayload(doc: AutoresponderDoc, prefix: string): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# Trigger: \`${doc.trigger}\`\n` +
      `-# Status: **${doc.enabled ? 'Enabled' : 'Disabled'}** — Match: **${doc.match_type === 'exact' ? 'Exact message' : 'Anywhere in message'}**\n` +
      `-# ID: \`${doc.ar_id ?? '—'}\`${doc.is_global ? ' · 🌐 Global' : ''}`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (doc.responses.length === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('No responses configured yet.'));
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(doc.responses.map(responseLine).join('\n')),
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Run \`${prefix}autoresponder edit ${doc.trigger}\` to manage this trigger`),
  );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Manage panel (interactive — the edit/add flow)
// ─────────────────────────────────────────────────────────────────────────────

export function buildAutoresponderManagePanel(doc: AutoresponderDoc, token: string, backToHome = false): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# Manage: \`${doc.trigger}\`\n` +
      `-# Status: **${doc.enabled ? 'Enabled' : 'Disabled'}** — Match: **${doc.match_type === 'exact' ? 'Exact message' : 'Anywhere in message'}**\n` +
      `-# ID: \`${doc.ar_id ?? '—'}\`${doc.is_global ? ' · 🌐 Global' : ''}`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (doc.responses.length === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('No responses yet — add a message or reaction below.'));
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(doc.responses.map(responseLine).join('\n')),
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  // Match type select
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ar-match:${token}`)
        .setPlaceholder('Match type')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Anywhere in message')
            .setDescription('Triggers when the trigger appears as a whole word')
            .setValue('anywhere')
            .setDefault(doc.match_type === 'anywhere'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Exact message only')
            .setDescription('Triggers only if the message is exactly the trigger')
            .setValue('exact')
            .setDefault(doc.match_type === 'exact'),
        ),
    ),
  );

  // Remove-response select (only if there are responses)
  if (doc.responses.length > 0) {
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ar-removeresp:${token}`)
          .setPlaceholder('Remove a response…')
          .addOptions(
            doc.responses.map((r, i) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(`${i + 1}. ${r.type === 'message' ? 'Message' : 'Reaction'}${r.type === 'message' && r.replyMode && r.replyMode !== 'normal' ? ` (${replyModeLabel(r.replyMode)})` : ''}`)
                .setDescription(r.content.length > 90 ? `${r.content.slice(0, 90)}…` : r.content)
                .setValue(String(i)),
            ),
          ),
      ),
    );
  }

  const responsesFull = doc.responses.length >= 5;

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ar-addmsg:${token}`)
        .setLabel('Add Message')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(responsesFull),
      new ButtonBuilder()
        .setCustomId(`ar-addreact:${token}`)
        .setLabel('Add Reaction')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(responsesFull),
      new ButtonBuilder()
        .setCustomId(`ar-toggle:${token}`)
        .setLabel(doc.enabled ? 'Disable' : 'Enable')
        .setStyle(doc.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ar-delete:${token}`)
        .setLabel('Delete Trigger')
        .setStyle(ButtonStyle.Danger),
    ),
  );

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...(backToHome ? [
        new ButtonBuilder()
          .setCustomId(`ar-back:${token}`)
          .setLabel('← Back')
          .setStyle(ButtonStyle.Secondary),
      ] : []),
      new ButtonBuilder()
        .setCustomId(`ar-done:${token}`)
        .setLabel('Done')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return wrap(container);
}

export function buildAutoresponderTimedOutPayload(doc: AutoresponderDoc): any {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# Manage: \`${doc.trigger}\`\n-# This panel has timed out. Run the command again to continue managing it.`,
    ),
  );
  return wrap(container);
}

export function buildAutoresponderClosedPayload(doc: AutoresponderDoc): any {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${emojis.blacktick} Closed the manage panel for \`${doc.trigger}\`.`),
  );
  return wrap(container);
}

export function buildAutoresponderDeletedPayload(trigger: string): any {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${emojis.blacktick} Deleted the \`${trigger}\` trigger.`),
  );
  return wrap(container);
}

export function buildAutoresponderHomeTimedOutPayload(): any {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# Autoresponder\n-# This panel has timed out. Run the command again to continue.`,
    ),
  );
  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reply mode select (shown after modal submit for message responses)
// ─────────────────────────────────────────────────────────────────────────────

function buildReplyModeSelectPayload(token: string): any {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## How should the bot send this message?\n` +
      `-# Pick a delivery mode, then the response will be saved.`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ar-replymode:${token}`)
        .setPlaceholder('Choose delivery mode…')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Normal message')
            .setDescription('Bot sends a plain message in the channel')
            .setValue('normal'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Reply (ping author)')
            .setDescription("Bot replies and pings the trigger message's author")
            .setValue('reply_mention'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Reply (no ping)')
            .setDescription('Bot replies without pinging the author')
            .setValue('reply_no_mention'),
        ),
    ),
  );
  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Modals
// ─────────────────────────────────────────────────────────────────────────────

function modalMessage(token: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`ar-modal-msg:${token}`)
    .setTitle('Add Message Response')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Message text')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('What should the bot say?')
          .setRequired(true)
          .setMaxLength(1900),
      ),
    );
}

function modalReaction(token: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`ar-modal-react:${token}`)
    .setTitle('Add Reaction Response')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Emoji (unicode, name, or ID)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('🐱  or  cat_ready  or  <a:cat_ready:1471740197577293954>')
          .setRequired(true)
          .setMaxLength(100),
      ),
    );
}

function modalTrigger(token: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`ar-modal-trigger:${token}`)
    .setTitle('Create New Autoresponder')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('trigger')
          .setLabel('Trigger text')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. hello, good morning, ping')
          .setRequired(true)
          .setMaxLength(100),
      ),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local modal-submit awaiter (mirrors container.ts's self-contained pattern)
// ─────────────────────────────────────────────────────────────────────────────

function awaitModal(client: CassieClient, customId: string, userId: string, ms: number): Promise<any | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.removeListener('interactionCreate', handler);
      resolve(null);
    }, ms);

    function handler(ix: any): void {
      if (ix.isModalSubmit?.() && ix.customId === customId && ix.user?.id === userId) {
        clearTimeout(timer);
        client.removeListener('interactionCreate', handler);
        resolve(ix);
      }
    }

    client.on('interactionCreate', handler);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Manage panel runner — owns the collector for the lifetime of the manage session
// ─────────────────────────────────────────────────────────────────────────────

export async function runAutoresponderManagePanel(
  message: any,
  client: CassieClient,
  guildId: string,
  triggerLower: string,
  opts?: { existingResponse?: any; backToHome?: boolean },
): Promise<void> {
  const getDoc = () => client.db!.getAutoresponder(guildId, triggerLower);

  let doc = await getDoc();
  if (!doc) return;

  const token = `${message.id}-${Date.now()}`;
  const backToHome = opts?.backToHome ?? false;

  let panelMsg: any;
  if (opts?.existingResponse) {
    await opts.existingResponse.update(buildAutoresponderManagePanel(doc, token, backToHome)).catch((): null => null);
    panelMsg = opts.existingResponse.message;
  } else {
    panelMsg = await message.channel.send({
      ...buildAutoresponderManagePanel(doc, token, backToHome),
    });
  }

  if (!panelMsg) return;

  const collector = panelMsg.createMessageComponentCollector({
    filter: (i: any) => {
      if (!i.customId.endsWith(`:${token}`)) return false;
      if (i.user.id !== message.author.id) {
        i.reply({ content: 'This manage panel is not for you.', flags: MessageFlags.Ephemeral }).catch((): null => null);
        return false;
      }
      return true;
    },
    time: 10 * 60_000,
  });

  collector.on('collect', async (i: any) => {
    try {
      // ── Match type select ──────────────────────────────────────────────
      if (i.isStringSelectMenu() && i.customId.startsWith('ar-match:')) {
        const matchType = i.values[0] as AutoresponderMatchType;
        await client.db!.setAutoresponderMatchType(guildId, triggerLower, matchType);
        doc = (await getDoc())!;
        await i.update(buildAutoresponderManagePanel(doc, token, backToHome)).catch((): null => null);
        return;
      }

      // ── Remove response select ─────────────────────────────────────────
      if (i.isStringSelectMenu() && i.customId.startsWith('ar-removeresp:')) {
        const idx = parseInt(i.values[0], 10);
        await client.db!.removeAutoresponderResponse(guildId, triggerLower, idx);
        doc = (await getDoc())!;
        await i.update(buildAutoresponderManagePanel(doc, token, backToHome)).catch((): null => null);
        return;
      }

      // ── Add message ─────────────────────────────────────────────────────
      if (i.isButton() && i.customId.startsWith('ar-addmsg:')) {
        const modal = modalMessage(token);
        await i.showModal(modal).catch((): null => null);
        const submit = await awaitModal(client, `ar-modal-msg:${token}`, message.author.id, 120_000);
        if (!submit) return;
        const content = submit.fields.getTextInputValue('content').trim();
        if (!content) {
          await submit.reply({ content: 'Message text cannot be empty.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        // Show reply-mode selector
        await submit.update(buildReplyModeSelectPayload(token)).catch((): null => null);

        // Wait for reply mode selection
        const modeCollector = panelMsg.createMessageComponentCollector({
          filter: (ix: any) => ix.customId === `ar-replymode:${token}` && ix.user.id === message.author.id,
          max: 1,
          time: 60_000,
        });

        const replyMode = await new Promise<AutoresponderReplyMode>((resolve) => {
          modeCollector.on('collect', (ix: any) => {
            resolve((ix.values[0] as AutoresponderReplyMode) ?? 'normal');
          });
          modeCollector.on('end', (_: any, reason: string) => {
            if (reason === 'time' || reason === 'limit') resolve('normal');
          });
        });

        await client.db!.addAutoresponderResponse(guildId, triggerLower, { type: 'message', content, replyMode });
        doc = (await getDoc())!;
        // Find the interaction that triggered the mode select to update with
        const latestIx = (modeCollector as any).collected?.last?.() ?? null;
        if (latestIx) {
          await latestIx.update(buildAutoresponderManagePanel(doc, token, backToHome)).catch((): null => null);
        } else {
          await panelMsg.edit(buildAutoresponderManagePanel(doc, token, backToHome)).catch((): null => null);
        }
        return;
      }

      // ── Add reaction ─────────────────────────────────────────────────────
      if (i.isButton() && i.customId.startsWith('ar-addreact:')) {
        const modal = modalReaction(token);
        await i.showModal(modal).catch((): null => null);
        const submit = await awaitModal(client, `ar-modal-react:${token}`, message.author.id, 120_000);
        if (!submit) return;
        const raw = submit.fields.getTextInputValue('content').trim();
        if (!raw) {
          await submit.reply({ content: 'Emoji cannot be empty.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        // Unicode emoji — no need to resolve against guild emoji cache.
        const isLikelyUnicode = !/^<a?:[\w]+:\d+>$/.test(raw) && !/^\d+$/.test(raw) && !/^[a-zA-Z0-9_]+$/.test(raw);
        let stored: string | null = null;
        if (isLikelyUnicode) {
          stored = raw;
        } else {
          const emoji = await resolveEmoji(client, raw, message.guild);
          if (!emoji) {
            await submit.reply({
              content: 'Could not find that emoji. Use a unicode emoji, or a custom emoji name/ID/mention the bot has access to.',
              flags: MessageFlags.Ephemeral,
            }).catch((): null => null);
            return;
          }
          stored = emoji.id ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : emoji.name;
        }

        await client.db!.addAutoresponderResponse(guildId, triggerLower, { type: 'reaction', content: stored! });
        doc = (await getDoc())!;
        await submit.update(buildAutoresponderManagePanel(doc, token, backToHome)).catch((): null => null);
        return;
      }

      // ── Toggle enabled ─────────────────────────────────────────────────
      if (i.isButton() && i.customId.startsWith('ar-toggle:')) {
        await client.db!.setAutoresponderEnabled(guildId, triggerLower, !doc!.enabled);
        doc = (await getDoc())!;
        await i.update(buildAutoresponderManagePanel(doc, token, backToHome)).catch((): null => null);
        return;
      }

      // ── Delete trigger ─────────────────────────────────────────────────
      if (i.isButton() && i.customId.startsWith('ar-delete:')) {
        await client.db!.deleteAutoresponder(guildId, triggerLower);
        collector.stop('deleted');
        await i.update(buildAutoresponderDeletedPayload(doc!.trigger)).catch((): null => null);
        return;
      }

      // ── Back to home ───────────────────────────────────────────────────
      if (i.isButton() && i.customId.startsWith('ar-back:')) {
        collector.stop('back');
        // Transition back to home panel in-place
        const allDocs = await client.db!.getAllAutoresponders(guildId).catch((): AutoresponderDoc[] => []);
        await i.update(buildAutoresponderHomePayload(allDocs, client.config.prefix, 0)).catch((): null => null);
        // Re-run the home panel collector on the same message
        await _runHomeCollectorOnExistingMessage(panelMsg, message, client, guildId);
        return;
      }

      // ── Done ─────────────────────────────────────────────────────────────
      if (i.isButton() && i.customId.startsWith('ar-done:')) {
        collector.stop('done');
        await i.update(buildAutoresponderClosedPayload(doc!)).catch((): null => null);
        return;
      }
    } catch {
      await i.deferUpdate().catch((): null => null);
    }
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      const latest = await getDoc();
      if (latest) await panelMsg.edit(buildAutoresponderTimedOutPayload(latest)).catch((): null => null);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Home panel runner — interactive entry point ($ar with no args)
// ─────────────────────────────────────────────────────────────────────────────

async function _runHomeCollectorOnExistingMessage(
  panelMsg: any,
  message: any,
  client: CassieClient,
  guildId: string,
  initialPage = 0,
  statusNote?: string,
): Promise<void> {
  let page = initialPage;
  const getDocs = () => client.db!.getAllAutoresponders(guildId).catch((): AutoresponderDoc[] => []);

  const collector = panelMsg.createMessageComponentCollector({
    filter: (i: any) => {
      const validIds = [
        'ar-home-prev:',
        'ar-home-next:',
        'ar-home-create',
        'ar-home-select:',
      ];
      const matches = validIds.some((p) => i.customId.startsWith(p));
      if (!matches) return false;
      if (i.user.id !== message.author.id) {
        i.reply({ content: 'This panel is not for you.', flags: MessageFlags.Ephemeral }).catch((): null => null);
        return false;
      }
      return true;
    },
    time: 10 * 60_000,
  });

  collector.on('collect', async (i: any) => {
    try {
      // ── Prev page ─────────────────────────────────────────────────────
      if (i.isButton() && i.customId.startsWith('ar-home-prev:')) {
        page = Math.max(0, page - 1);
        const docs = await getDocs();
        await i.update(buildAutoresponderHomePayload(docs, client.config.prefix, page)).catch((): null => null);
        return;
      }

      // ── Next page ─────────────────────────────────────────────────────
      if (i.isButton() && i.customId.startsWith('ar-home-next:')) {
        const docs = await getDocs();
        const totalPages = Math.max(1, Math.ceil(docs.length / HOME_PAGE_SIZE));
        page = Math.min(totalPages - 1, page + 1);
        await i.update(buildAutoresponderHomePayload(docs, client.config.prefix, page)).catch((): null => null);
        return;
      }

      // ── Create new trigger ────────────────────────────────────────────
      if (i.isButton() && i.customId === 'ar-home-create') {
        const triggerToken = `${message.id}-${Date.now()}`;
        const modal = modalTrigger(triggerToken);
        await i.showModal(modal).catch((): null => null);
        const submit = await awaitModal(client, `ar-modal-trigger:${triggerToken}`, message.author.id, 120_000);
        if (!submit) return;

        const trigger = submit.fields.getTextInputValue('trigger').trim();
        if (!trigger) {
          await submit.reply({ content: 'Trigger text cannot be empty.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }
        if (trigger.length > 100) {
          await submit.reply({ content: 'Trigger must be 100 characters or fewer.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        const result = await client.db!.createAutoresponder(guildId, trigger, 'anywhere', message.author.id);
        if (result === 'duplicate') {
          await submit.reply({ content: `A trigger for \`${trigger}\` already exists.`, flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }
        if (result === 'limit') {
          await submit.reply({ content: `This server already has the maximum of **${MAX_PER_GUILD}** triggers.`, flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }
        if (!result) {
          await submit.reply({ content: 'Failed to create the trigger. Try again.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        collector.stop('navigate');
        // Transition to manage panel in-place
        await runAutoresponderManagePanel(message, client, guildId, trigger.toLowerCase(), {
          existingResponse: submit,
          backToHome: true,
        });
        return;
      }

      // ── Select trigger to manage ──────────────────────────────────────
      if (i.isStringSelectMenu() && i.customId.startsWith('ar-home-select:')) {
        const triggerLower = i.values[0];
        collector.stop('navigate');
        await runAutoresponderManagePanel(message, client, guildId, triggerLower, {
          existingResponse: i,
          backToHome: true,
        });
        return;
      }
    } catch {
      await i.deferUpdate().catch((): null => null);
    }
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      await panelMsg.edit(buildAutoresponderHomeTimedOutPayload()).catch((): null => null);
    }
  });
}

export async function runAutoresponderHomePanel(
  message: any,
  client: CassieClient,
  guildId: string,
  initialPage = 0,
  statusNote?: string,
): Promise<void> {
  const docs = await client.db!.getAllAutoresponders(guildId).catch((): AutoresponderDoc[] => []);
  const panelMsg = await message.channel.send(
    buildAutoresponderHomePayload(docs, client.config.prefix, initialPage, statusNote),
  );
  if (!panelMsg) return;
  await _runHomeCollectorOnExistingMessage(panelMsg, message, client, guildId, initialPage, statusNote);
}

export type { AutoresponderResponseType };
