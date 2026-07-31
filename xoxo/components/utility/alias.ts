// xoxo/components/utility/alias.ts
//
// Interactive panel for personal, per-user command aliases (global — work in
// every server). Follows the autoresponder self-contained collector pattern.
//
// Selectable commands are restricted to the three categories:
//   moderation · utility · vcControls
// The `alias` command itself is always excluded.
//
// Flow:
//   Home      — paginated list (15/page), Create / Delete buttons
//   Create    — command select (paginated 24/page) → modal for alias name
//   Delete    — select-menu of existing aliases
//
// Interaction-failed safety rule: every interaction is acknowledged within
// the 3-second Discord window. Any async DB work is done AFTER deferUpdate /
// showModal so the token never expires before we respond.
//
// CustomId scheme:
//   alias:prev|next|create|delete|cancel:<msgId>
//   alias:cmdselect:<msgId>
//   alias:delselect:<msgId>
//   alias-modal:<msgId>

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import type { Database, UserCommandAliasDoc } from '../../database/database.js';
import { emojis } from '../../emojis.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const NO_MENTIONS = { parse: [] as any[] };
const HOME_PAGE_SIZE  = 15;
const CMD_PAGE_SIZE   = 24; // 24 commands + 1 nav option = 25 (Discord select cap)
const MAX_PER_USER    = 15;
const MAX_ALIAS_LEN   = 14;
const ALIAS_NAME_RE   = /^[a-zA-Z0-9_-]{1,14}$/;
const TIMEOUT_MS      = 5 * 60_000;
const MODAL_MS        = 2 * 60_000;

/** Only these three categories may be aliased. Lowercase for comparison. */
const ALLOWED_CATEGORIES = new Set(['moderation', 'utility', 'vccontrols']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrap(container: ContainerBuilder): any {
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_MENTIONS };
}

function isGlobalNameTaken(client: LevitateClient, lower: string): boolean {
  return client.commands.has(lower) || client.aliases.has(lower);
}

// ── Available commands ────────────────────────────────────────────────────────

/**
 * Returns all aliasable command names (sorted a–z), filtered to the three
 * allowed categories, excluding `alias` itself and dev-only commands unless
 * the invoker is a developer.
 */
function getAliasableCommands(client: LevitateClient, isDeveloper: boolean): string[] {
  const list: string[] = [];
  for (const cmd of client.commands.values()) {
    const opts = (cmd as any).options ?? {};
    const name: string = opts.name;
    const category: string = (opts.category ?? '').toLowerCase();
    if (!name || name === 'alias') continue;
    if (!ALLOWED_CATEGORIES.has(category)) continue;
    if (opts.owner === true && !isDeveloper) continue;
    list.push(name);
  }
  return list.sort();
}

// ── Payload builders ──────────────────────────────────────────────────────────

function buildHomePayload(
  docs:      UserCommandAliasDoc[],
  page:      number,
  targetTag: string,
  readOnly:  boolean,
  msgId:     string,
  disabled = false,
): any {
  const totalPages = Math.max(1, Math.ceil(docs.length / HOME_PAGE_SIZE));
  const p = Math.min(Math.max(page, 0), totalPages - 1);
  const slice = docs.slice(p * HOME_PAGE_SIZE, p * HOME_PAGE_SIZE + HOME_PAGE_SIZE);

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# ${emojis.blackCards} ${readOnly ? `${targetTag}'s Aliases` : 'Your Command Aliases'}\n` +
      `-# ${docs.length}/${MAX_PER_USER} aliases — Page ${p + 1}/${totalPages}` +
      (readOnly ? '\n-# Read-only — developer view' : ''),
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (docs.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        readOnly
          ? `${emojis.info} This user hasn't created any aliases yet.`
          : `${emojis.info} No aliases yet — press **Create Alias** to add your first one.`,
      ),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        slice.map((d) => `${emojis.greentick} \`${d.alias}\` → \`${d.command}\``).join('\n'),
      ),
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`alias:prev:${msgId}`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || p === 0),
    new ButtonBuilder()
      .setCustomId(`alias:next:${msgId}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || p >= totalPages - 1),
  );

  if (!readOnly) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`alias:create:${msgId}`)
        .setLabel('Create Alias')
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled || docs.length >= MAX_PER_USER),
      new ButtonBuilder()
        .setCustomId(`alias:delete:${msgId}`)
        .setLabel('Delete Alias')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled || docs.length === 0),
    );
  }
  container.addActionRowComponents(row);

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      readOnly
        ? `-# Aliases are private — only \`${targetTag}\` can use theirs.`
        : `-# Private to you, global across all servers — max ${MAX_PER_USER}, one per command, ${MAX_ALIAS_LEN} chars max.`,
    ),
  );

  return wrap(container);
}

/**
 * Builds the command-picker select menu for the create flow.
 * If total commands exceed CMD_PAGE_SIZE, paginates using special sentinel
 * option values `__prev__` / `__next__`.
 */
function buildCommandSelectPayload(
  allCommands:      string[],
  page:             number,
  existingCmds:     Set<string>,
  msgId:            string,
): any {
  const available = allCommands.filter((n) => !existingCmds.has(n));
  const totalPages = Math.max(1, Math.ceil(available.length / CMD_PAGE_SIZE));
  const p = Math.min(Math.max(page, 0), totalPages - 1);
  const slice = available.slice(p * CMD_PAGE_SIZE, p * CMD_PAGE_SIZE + CMD_PAGE_SIZE);

  const options: StringSelectMenuOptionBuilder[] = [];
  if (p > 0) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('← Previous page')
        .setValue('__prev__')
        .setDescription(`Page ${p} of ${totalPages}`),
    );
  }
  for (const name of slice) {
    options.push(new StringSelectMenuOptionBuilder().setLabel(name).setValue(name));
  }
  if (p < totalPages - 1) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('Next page →')
        .setValue('__next__')
        .setDescription(`Page ${p + 2} of ${totalPages}`),
    );
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${emojis.greenSparkles} Create Alias — Pick a command\n` +
        `-# ${available.length} command(s) available — Page ${p + 1}/${totalPages}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (options.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emojis.info} No more commands left to alias.`),
    );
  } else {
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`alias:cmdselect:${msgId}`)
          .setPlaceholder('Choose a command to alias…')
          .addOptions(options),
      ),
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`alias:cancel:${msgId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      ),
    );

  return wrap(container);
}

function buildAliasModal(command: string, msgId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`alias-modal:${msgId}`)
    .setTitle(`Create alias for "${command}"`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel(`Alias name (max ${MAX_ALIAS_LEN} characters)`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g.  b  or  jnl  or  banish')
          .setRequired(true)
          .setMaxLength(MAX_ALIAS_LEN),
      ),
    );
}

function buildDeleteSelectPayload(docs: UserCommandAliasDoc[], msgId: string): any {
  return wrap(
    new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# ${emojis.redcross} Delete Alias\nChoose an alias to remove.`),
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`alias:delselect:${msgId}`)
            .setPlaceholder('Choose an alias…')
            .addOptions(
              docs.slice(0, 25).map((d) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(d.alias)
                  .setDescription(`→ ${d.command}`)
                  .setValue(d.alias_lower),
              ),
            ),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`alias:cancel:${msgId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
  );
}

// ── Local modal awaiter ────────────────────────────────────────────────────────

function awaitModal(
  client:   LevitateClient,
  customId: string,
  userId:   string,
  ms:       number,
): Promise<any | null> {
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

// ── Alias name validation ──────────────────────────────────────────────────────

function validateAliasName(client: LevitateClient, raw: string): string | null {
  if (!raw) return 'Alias name cannot be empty.';
  if (raw.length > MAX_ALIAS_LEN) return `Alias name must be **${MAX_ALIAS_LEN}** characters or fewer.`;
  if (!ALIAS_NAME_RE.test(raw))
    return 'Alias name can only contain letters, numbers, `_` and `-` — no spaces or special characters.';

  const lower = raw.toLowerCase();
  if (lower === 'alias') return 'That name is reserved for the `alias` command itself.';
  if (isGlobalNameTaken(client, lower)) return `\`${raw}\` is already a built-in command name — pick a different alias.`;

  return null;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runAliasHomePanel(
  message:     any,
  client:      LevitateClient,
  targetId:    string,
  targetTag:   string,
  readOnly:    boolean,
  isDeveloper: boolean,
): Promise<void> {
  const db: Database = client.db!;
  const docs = await db.getUserAliases(targetId).catch((): UserCommandAliasDoc[] => []);

  const panelMsg = await message.channel.send(
    buildHomePayload(docs, 0, targetTag, readOnly, message.id),
  ).catch((): null => null);
  if (!panelMsg) return;

  await _homeCollector(panelMsg, message, client, db, targetId, targetTag, readOnly, isDeveloper, 0);
}

// ── Home collector ────────────────────────────────────────────────────────────

async function _homeCollector(
  panelMsg:    any,
  message:     any,
  client:      LevitateClient,
  db:          Database,
  targetId:    string,
  targetTag:   string,
  readOnly:    boolean,
  isDeveloper: boolean,
  startPage:   number,
): Promise<void> {
  const msgId = message.id;
  const authorId = message.author.id;
  let page = startPage;

  const getDocs = (): Promise<UserCommandAliasDoc[]> =>
    db.getUserAliases(targetId).catch((): UserCommandAliasDoc[] => []);

  const collector = panelMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
      i, authorId,
      (cid: string) => cid.startsWith('alias:') && cid.endsWith(`:${msgId}`),
    ),
    time: TIMEOUT_MS,
  });

  collector.on('collect', async (i: any) => {
    const action: string = i.customId.split(':')[1];
    try {
      // ── Pagination ──────────────────────────────────────────────────────────
      if (action === 'prev' || action === 'next') {
        const docs = await getDocs();
        const total = Math.max(1, Math.ceil(docs.length / HOME_PAGE_SIZE));
        page = action === 'prev' ? Math.max(0, page - 1) : Math.min(total - 1, page + 1);
        // Update is quick enough: docs already fetched above
        await i.update(buildHomePayload(docs, page, targetTag, readOnly, msgId)).catch((): null => null);
        return;
      }

      // ── Create ──────────────────────────────────────────────────────────────
      if (action === 'create' && !readOnly) {
        // Acknowledge immediately — DB work happens after
        await i.deferUpdate().catch((): null => null);
        collector.stop('navigate');

        const allCommands   = getAliasableCommands(client, isDeveloper);
        const existing      = await getDocs();
        const existingCmds  = new Set(existing.map((d) => d.command));

        await panelMsg.edit(buildCommandSelectPayload(allCommands, 0, existingCmds, msgId))
          .catch((): null => null);
        await _createCollector(
          panelMsg, message, client, db, targetId, targetTag, readOnly, isDeveloper,
          allCommands, existingCmds, page,
        );
        return;
      }

      // ── Delete ──────────────────────────────────────────────────────────────
      if (action === 'delete' && !readOnly) {
        // Acknowledge immediately — DB work happens after
        await i.deferUpdate().catch((): null => null);
        collector.stop('navigate');

        const docs = await getDocs();
        await panelMsg.edit(buildDeleteSelectPayload(docs, msgId)).catch((): null => null);
        await _deleteCollector(
          panelMsg, message, client, db, targetId, targetTag, readOnly, isDeveloper, page,
        );
        return;
      }
    } catch {
      // Interaction was already deferUpdate'd or update'd above; nothing extra needed.
    }
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      const docs = await getDocs();
      await panelMsg.edit(buildHomePayload(docs, page, targetTag, readOnly, msgId, true))
        .catch((): null => null);
    }
  });
}

// ── Create flow collector ─────────────────────────────────────────────────────

async function _createCollector(
  panelMsg:     any,
  message:      any,
  client:       LevitateClient,
  db:           Database,
  targetId:     string,
  targetTag:    string,
  readOnly:     boolean,
  isDeveloper:  boolean,
  allCommands:  string[],
  existingCmds: Set<string>,
  homePage:     number,
): Promise<void> {
  const msgId    = message.id;
  const authorId = message.author.id;
  let   cmdPage  = 0;

  /** Edit panel back to home and restart the home collector. */
  const backToHome = async (): Promise<void> => {
    const docs = await db.getUserAliases(targetId).catch((): UserCommandAliasDoc[] => []);
    await panelMsg.edit(buildHomePayload(docs, homePage, targetTag, readOnly, msgId))
      .catch((): null => null);
    await _homeCollector(
      panelMsg, message, client, db, targetId, targetTag, readOnly, isDeveloper, homePage,
    );
  };

  const stepCollector = panelMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
      i, authorId,
      (cid: string) => cid.startsWith('alias:') && cid.endsWith(`:${msgId}`),
    ),
    time: TIMEOUT_MS,
  });

  stepCollector.on('collect', async (i: any) => {
    const action: string = i.customId.split(':')[1];
    try {
      // ── Cancel ──────────────────────────────────────────────────────────────
      if (action === 'cancel') {
        stepCollector.stop('cancel');
        // Ack first, then do async work
        await i.deferUpdate().catch((): null => null);
        await backToHome();
        return;
      }

      // ── Command select (pagination sentinels + real command selection) ───────
      if (action === 'cmdselect') {
        const value = i.values[0];

        // ── Pagination nav ───────────────────────────────────────────────────
        if (value === '__next__') {
          cmdPage++;
          await i.update(buildCommandSelectPayload(allCommands, cmdPage, existingCmds, msgId))
            .catch((): null => null);
          return;
        }
        if (value === '__prev__') {
          cmdPage = Math.max(0, cmdPage - 1);
          await i.update(buildCommandSelectPayload(allCommands, cmdPage, existingCmds, msgId))
            .catch((): null => null);
          return;
        }

        // ── Real command picked — show modal (modal IS the ack for i) ─────────
        const commandName = value;
        stepCollector.stop('modal');

        const shown = await i.showModal(buildAliasModal(commandName, msgId))
          .then((): true => true)
          .catch((): false => false);

        if (!shown) {
          // showModal failed — fall back to deferUpdate so Discord doesn't
          // show "Interaction failed", then restore home
          await i.deferUpdate().catch((): null => null);
          await backToHome();
          return;
        }

        const submit = await awaitModal(client, `alias-modal:${msgId}`, authorId, MODAL_MS);
        if (!submit) {
          // Modal timed out — restore home without any ephemeral
          await backToHome();
          return;
        }

        const raw      = submit.fields.getTextInputValue('name').trim();
        const errorMsg = validateAliasName(client, raw);
        if (errorMsg) {
          await submit.reply({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch((): null => null);
          await backToHome();
          return;
        }

        const result = await db.createUserAlias(targetId, raw, commandName);
        if (result === 'duplicate_alias') {
          await submit.reply({
            content: `You already have an alias named \`${raw}\`. Pick a different name.`,
            flags: MessageFlags.Ephemeral,
          }).catch((): null => null);
          await backToHome();
          return;
        }
        if (result === 'duplicate_command') {
          await submit.reply({
            content: `You already have an alias for \`${commandName}\`. Delete it first.`,
            flags: MessageFlags.Ephemeral,
          }).catch((): null => null);
          await backToHome();
          return;
        }
        if (result === 'limit') {
          await submit.reply({
            content: `You've hit the **${MAX_PER_USER}** alias limit. Delete one first.`,
            flags: MessageFlags.Ephemeral,
          }).catch((): null => null);
          await backToHome();
          return;
        }
        if (!result) {
          await submit.reply({
            content: 'Failed to create the alias — please try again.',
            flags: MessageFlags.Ephemeral,
          }).catch((): null => null);
          await backToHome();
          return;
        }

        // ── Success — update in-memory cache and return to home ───────────────
        if (!client.userAliases.has(targetId)) client.userAliases.set(targetId, new Map());
        client.userAliases.get(targetId)!.set(raw.toLowerCase(), commandName);

        const docs = await db.getUserAliases(targetId).catch((): UserCommandAliasDoc[] => []);
        // submit.update() edits the panel AND acks the modal submit in one call
        await submit.update(buildHomePayload(docs, 0, targetTag, readOnly, msgId))
          .catch((): null => null);
        await _homeCollector(
          panelMsg, message, client, db, targetId, targetTag, readOnly, isDeveloper, 0,
        );
        return;
      }
    } catch {
      await i.deferUpdate().catch((): null => null);
    }
  });

  stepCollector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      await backToHome().catch((): null => null);
    }
  });
}

// ── Delete flow collector ─────────────────────────────────────────────────────

async function _deleteCollector(
  panelMsg:    any,
  message:     any,
  client:      LevitateClient,
  db:          Database,
  targetId:    string,
  targetTag:   string,
  readOnly:    boolean,
  isDeveloper: boolean,
  homePage:    number,
): Promise<void> {
  const msgId    = message.id;
  const authorId = message.author.id;

  const backToHome = async (): Promise<void> => {
    const docs = await db.getUserAliases(targetId).catch((): UserCommandAliasDoc[] => []);
    await panelMsg.edit(buildHomePayload(docs, homePage, targetTag, readOnly, msgId))
      .catch((): null => null);
    await _homeCollector(
      panelMsg, message, client, db, targetId, targetTag, readOnly, isDeveloper, homePage,
    );
  };

  const stepCollector = panelMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
      i, authorId,
      (cid: string) => cid.startsWith('alias:') && cid.endsWith(`:${msgId}`),
    ),
    time: TIMEOUT_MS,
  });

  stepCollector.on('collect', async (i: any) => {
    const action: string = i.customId.split(':')[1];
    try {
      if (action === 'cancel') {
        stepCollector.stop('cancel');
        await i.deferUpdate().catch((): null => null);
        await backToHome();
        return;
      }

      if (action === 'delselect') {
        const aliasLower = i.values[0];
        stepCollector.stop('deleted');

        // Ack immediately
        await i.deferUpdate().catch((): null => null);

        await db.deleteUserAlias(targetId, aliasLower);
        client.userAliases.get(targetId)?.delete(aliasLower);

        await backToHome();
        return;
      }
    } catch {
      await i.deferUpdate().catch((): null => null);
    }
  });

  stepCollector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      await backToHome().catch((): null => null);
    }
  });
}
