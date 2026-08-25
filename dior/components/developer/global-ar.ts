import { config } from '../../config.js';
// xoxo/components/developer/global-ar.ts
//
// Interactive panel for the $global-ar developer command.
// Lists every autoresponder across every guild, paginated (20 per page),
// with a multi-select StringSelectMenu pre-selecting triggers that are
// currently is_global=true. Selecting/deselecting immediately toggles
// is_global for changed ar_ids.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import type { AutoresponderDoc } from '../../database/database.js';
import { emojis } from '../../emojis.js';

const PAGE_SIZE = 20;
const TIMEOUT_MS = 10 * 60_000;

function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function buildGlobalArPanel(
  docs: AutoresponderDoc[],
  page: number,
  client: CassieClient,
  statusNote?: string,
): any {
  const totalPages = Math.max(1, Math.ceil(docs.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1);
  const slice = docs.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));

  const noteText = statusNote ? `\n-# ${statusNote}` : '';
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# Global Autoresponders\n` +
      `-# ${docs.length} total triggers across all guilds — Page ${clampedPage + 1}/${totalPages}` +
      noteText,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (slice.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('No autoresponders found across any guild.'),
    );
  } else {
    // Build select menu — pre-select those with is_global=true
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`gar-select:${page}`)
      .setPlaceholder('Toggle global status — selected = currently global')
      .setMinValues(0)
      .setMaxValues(slice.length)
      .addOptions(
        slice.map((doc) => {
          const guildName = (client.guilds.cache.get(doc.guild_id)?.name ?? doc.guild_id).slice(0, 30);
          const trigger = doc.trigger.length > 40 ? doc.trigger.slice(0, 37) + '…' : doc.trigger;
          const label = `${trigger} — ${guildName} (${doc.ar_id ?? '?'})`.slice(0, 100);
          const desc = `${doc.enabled ? 'Enabled' : 'Disabled'} · ${doc.match_type === 'exact' ? 'Exact' : 'Anywhere'} · ${doc.responses.length} resp`.slice(0, 100);
          return new StringSelectMenuOptionBuilder()
            .setLabel(label)
            .setDescription(desc)
            .setValue(doc.ar_id ?? doc.trigger_lower)
            .setDefault(doc.is_global === true);
        }),
      );

    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`gar-prev:${page}`)
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(clampedPage === 0),
      new ButtonBuilder()
        .setCustomId(`gar-next:${page}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(clampedPage >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(`gar-done`)
        .setLabel('Done')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Select triggers to mark as global (fires in ALL guilds). Deselect to remove global status.`,
    ),
  );

  return wrap(container);
}

export async function runGlobalArPanel(
  message: any,
  client: CassieClient,
): Promise<void> {
  if (!client.db) return;

  const getDocs = () => client.db!.getAllAutorespondersAcrossGuilds().catch((): AutoresponderDoc[] => []);

  let page = 0;
  let docs = await getDocs();

  const panelMsg = await message.channel.send(buildGlobalArPanel(docs, page, client)).catch((): null => null);
  if (!panelMsg) return;

  // Track the currently-selected ar_ids on each page (by page index)
  // so we can diff on next selection event.
  // Key: page index, Value: Set of ar_ids selected (= global) before last interaction on that page
  const pageSelectedState = new Map<number, Set<string>>();

  function getPageSelectedState(p: number, currentDocs: AutoresponderDoc[]): Set<string> {
    if (pageSelectedState.has(p)) return pageSelectedState.get(p)!;
    // Initialize from current DB state
    const slice = currentDocs.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
    const s = new Set<string>(slice.filter((d) => d.is_global).map((d) => d.ar_id ?? d.trigger_lower));
    pageSelectedState.set(p, s);
    return s;
  }

  const collector = panelMsg.createMessageComponentCollector({
    filter: (i: any) => {
      const valid = i.customId.startsWith('gar-');
      if (!valid) return false;
      if (i.user.id !== message.author.id) {
        i.reply({ content: 'This panel is not for you.', flags: MessageFlags.Ephemeral }).catch((): null => null);
        return false;
      }
      return true;
    },
    time: TIMEOUT_MS,
  });

  collector.on('collect', async (i: any) => {
    try {
      // ── Select menu: toggle global status ──────────────────────────────
      if (i.isStringSelectMenu() && i.customId.startsWith('gar-select:')) {
        // Refresh docs for accurate state
        docs = await getDocs();
        const slice = docs.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
        const pageArIds = new Set<string>(slice.map((d) => d.ar_id ?? d.trigger_lower));

        const prevSelected = getPageSelectedState(page, docs);
        const newSelected = new Set<string>(i.values as string[]);

        // Determine what changed on this page only
        const toEnable: string[] = [];
        const toDisable: string[] = [];
        for (const arId of pageArIds) {
          const wasSelected = prevSelected.has(arId);
          const isSelected = newSelected.has(arId);
          if (isSelected && !wasSelected) toEnable.push(arId);
          else if (!isSelected && wasSelected) toDisable.push(arId);
        }

        let changed = 0;
        for (const arId of toEnable) {
          const ok = await client.db!.setAutoresponderGlobal(arId, true).catch((): boolean => false);
          if (ok) changed++;
        }
        for (const arId of toDisable) {
          const ok = await client.db!.setAutoresponderGlobal(arId, false).catch((): boolean => false);
          if (ok) changed++;
        }

        // Update tracked state for this page
        pageSelectedState.set(page, newSelected);

        // Re-fetch and render
        docs = await getDocs();
        const note = changed > 0 ? `Updated ${changed} trigger${changed === 1 ? '' : 's'}` : undefined;
        await i.update(buildGlobalArPanel(docs, page, client, note)).catch((): null => null);
        return;
      }

      // ── Prev page ───────────────────────────────────────────────────────
      if (i.isButton() && i.customId.startsWith('gar-prev:')) {
        page = Math.max(0, page - 1);
        docs = await getDocs();
        await i.update(buildGlobalArPanel(docs, page, client)).catch((): null => null);
        return;
      }

      // ── Next page ───────────────────────────────────────────────────────
      if (i.isButton() && i.customId.startsWith('gar-next:')) {
        docs = await getDocs();
        const totalPages = Math.max(1, Math.ceil(docs.length / PAGE_SIZE));
        page = Math.min(totalPages - 1, page + 1);
        await i.update(buildGlobalArPanel(docs, page, client)).catch((): null => null);
        return;
      }

      // ── Done ────────────────────────────────────────────────────────────
      if (i.isButton() && i.customId === 'gar-done') {
        collector.stop('done');
        const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`${emojis.blacktick} Closed the global autoresponder panel.`),
        );
        await i.update(wrap(container)).catch((): null => null);
        return;
      }
    } catch {
      await i.deferUpdate().catch((): null => null);
    }
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# Global Autoresponders\n-# This panel has timed out. Run the command again to continue.`,
        ),
      );
      await panelMsg.edit(wrap(container)).catch((): null => null);
    }
  });
}
