// xoxo/components/utility/container.ts
//
// Interactive CV2 message composer ("Message Builder").
// Entry point: startBuilderSession()
//
// Block types: text · spacer · info · photos · links
// Modes: idle → add/edit/remove/duplicate/color/move/spacerEdit/send/done
//
// Bug note: modal submit interactions must use submit.update(payload)
// (response type 6 = UPDATE_MESSAGE), not deferUpdate() + msg.edit().
// Field values are read via getTextInputValue(), not getField().value.

import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { config } from '../../config.js';
import { emojis } from '../../emojis.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';

const SAVE_NAME_MAX = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type BlockType = 'text' | 'spacer' | 'info' | 'photos' | 'links';
type BuilderMode =
  | 'idle'
  | 'color'
  | 'edit'
  | 'remove'
  | 'duplicate'
  | 'move'
  | 'spacerEdit'
  | 'send'
  | 'done'
  | 'loaddata';

interface TextBlock   { type: 'text';   content: string; }
interface SpacerBlock { type: 'spacer'; line: boolean; size: 'sm' | 'lg'; }
interface InfoBlock   { type: 'info';   body: string; image: string | null; }
interface PhotosBlock { type: 'photos'; urls: string[]; }
interface LinksBlock  { type: 'links';  items: { label: string; url: string; emoji?: string }[]; }
type Block = TextBlock | SpacerBlock | InfoBlock | PhotosBlock | LinksBlock;

interface BuilderSession {
  authorId:   string;
  hue:        string;   // key into PALETTE
  blocks:     Block[];
  mode:       BuilderMode;
  activeIdx:  number | null;  // used by move + spacerEdit
  client:     CassieClient;
  msg:        any;
  /** Guild saved-data entries of type 'cv2', for the Load Data picker. */
  savedItems: any[];
  dataPage:   number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────────────────────────────────────

const PALETTE: Record<string, number | null> = {
  none:     null,
  blurple:  0x5865F2,
  red:      0xED4245,
  green:    0x57F287,
  yellow:   0xFEE75C,
  orange:   0xE67E22,
  purple:   0x9B59B6,
  fuchsia:  0xEB459E,
  aqua:     0x1ABC9C,
  charcoal: 0x2C2F33,
  white:    0xFFFFFF,
};

const PALETTE_LABELS: Record<string, string> = {
  none:     'None',
  blurple:  'Blurple',
  red:      'Red',
  green:    'Green',
  yellow:   'Yellow',
  orange:   'Orange',
  purple:   'Purple',
  fuchsia:  'Fuchsia',
  aqua:     'Aqua',
  charcoal: 'Charcoal',
  white:    'White',
};

const MAX_BLOCKS  = 20;
const SESSION_MS  = 30 * 60_000;

// ─────────────────────────────────────────────────────────────────────────────
// Session registry
// ─────────────────────────────────────────────────────────────────────────────

export const builderSessions = new Map<string, BuilderSession>();

// ─────────────────────────────────────────────────────────────────────────────
// Block label helpers
// ─────────────────────────────────────────────────────────────────────────────

function blockTag(b: Block, i: number): string {
  switch (b.type) {
    case 'text': {
      const p = b.content.slice(0, 48).replace(/\n/g, ' ');
      return `${i + 1}. Text — ${p}`;
    }
    case 'spacer': {
      const kind = b.line ? 'line' : 'blank gap';
      return `${i + 1}. Spacer (${b.size === 'lg' ? 'large' : 'small'} ${kind})`;
    }
    case 'info': {
      const flag = b.image ? ' 🖼' : '';
      const p    = b.body.slice(0, 40).replace(/\n/g, ' ');
      return `${i + 1}. Info Card${flag} — ${p}`;
    }
    case 'photos': {
      const n = b.urls.length;
      return `${i + 1}. Photo Grid (${n} picture${n !== 1 ? 's' : ''})`;
    }
    case 'links': {
      const labels = b.items.slice(0, 3).map(l => l.label).join(', ');
      const more   = b.items.length > 3 ? '…' : '';
      return `${i + 1}. Quick Links — ${labels}${more}`;
    }
  }
}

function blockMenuOptions(
  s:      BuilderSession,
  active  = false,
): StringSelectMenuOptionBuilder[] {
  return s.blocks.map((b, i) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(blockTag(b, i).slice(0, 100))
      .setValue(String(i))
      .setDefault(active && i === s.activeIdx),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Render — write a Block into an existing ContainerBuilder
// ─────────────────────────────────────────────────────────────────────────────

function renderBlock(container: ContainerBuilder, b: Block): void {
  switch (b.type) {
    case 'text':
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(b.content),
      );
      break;

    case 'spacer': {
      const sep = new SeparatorBuilder()
        .setSpacing(b.size === 'lg' ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small)
        .setDivider(b.line);
      container.addSeparatorComponents(sep);
      break;
    }

    case 'info': {
      // Thumbnail fixed via setThumbnailAccessory — correct djs v14 API
      if (b.image) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(b.body))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(b.image));
        container.addSectionComponents(section);
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(b.body),
        );
      }
      break;
    }

    case 'photos': {
      if (b.urls.length > 0) {
        container.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            ...b.urls.map(u => new MediaGalleryItemBuilder().setURL(u)),
          ),
        );
      }
      break;
    }

    case 'links': {
      if (b.items.length > 0) {
        const btns = b.items.slice(0, 5).map(l => {
          const btn = new ButtonBuilder()
            .setLabel(l.label)
            .setStyle(ButtonStyle.Link)
            .setURL(l.url);
          if (l.emoji) btn.setEmoji(l.emoji);
          return btn;
        });
        container.addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(...btns),
        );
      }
      break;
    }
  }
}

function buildOutputContainer(s: BuilderSession): ContainerBuilder {
  const c = new ContainerBuilder();
  const accent = PALETTE[s.hue];
  if (accent !== null && accent !== undefined) c.setAccentColor(accent);

  if (s.blocks.length === 0) {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent('*(empty)*'));
  } else {
    for (const b of s.blocks) renderBlock(c, b);
  }

  return c;
}

function buildPreview(s: BuilderSession): ContainerBuilder {
  const c = new ContainerBuilder();

  const accent = PALETTE[s.hue];
  if (accent !== null && accent !== undefined) c.setAccentColor(accent);

  if (s.blocks.length === 0) {
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Nothing here yet — tap **Add a block** below to get started.',
      ),
    );
  } else {
    for (const b of s.blocks) renderBlock(c, b);
  }

  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
// Control panels — one ContainerBuilder per mode
// ─────────────────────────────────────────────────────────────────────────────

function ctrlIdle(s: BuilderSession): ContainerBuilder {
  const atMax    = s.blocks.length >= MAX_BLOCKS;
  const has      = s.blocks.length > 0;
  const canMove  = s.blocks.length >= 2;
  const hueLabel = PALETTE_LABELS[s.hue] ?? 'None';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Message Builder'),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${s.blocks.length} / ${MAX_BLOCKS} blocks  ·  ${hueLabel} accent`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mb:insert')
          .setPlaceholder(atMax ? `Block limit (${MAX_BLOCKS}) reached` : 'Add a block…')
          .setDisabled(atMax)
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('Text')
              .setValue('text')
              .setDescription('A block of writing'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Spacer')
              .setValue('spacer')
              .setDescription('Blank space or a divider line'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Info Card')
              .setValue('info')
              .setDescription('A short blurb next to a small picture'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Photo Grid')
              .setValue('photos')
              .setDescription('Show up to 10 pictures'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Quick Links')
              .setValue('links')
              .setDescription('Clickable link buttons, up to 5'),
          ),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('mb:edit').setLabel('Edit').setStyle(ButtonStyle.Secondary).setDisabled(!has),
        new ButtonBuilder().setCustomId('mb:remove').setLabel('Remove').setStyle(ButtonStyle.Danger).setDisabled(!has),
        new ButtonBuilder().setCustomId('mb:duplicate').setLabel('Duplicate').setStyle(ButtonStyle.Secondary).setDisabled(!has),
        new ButtonBuilder().setCustomId('mb:color').setLabel('Color').setStyle(ButtonStyle.Secondary),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('mb:move').setLabel('Move').setStyle(ButtonStyle.Secondary).setDisabled(!canMove),
        new ButtonBuilder().setCustomId('mb:send').setLabel('Send').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mb:savedata').setLabel('Save as Data').setStyle(ButtonStyle.Secondary).setDisabled(!has),
        new ButtonBuilder().setCustomId('mb:loaddata').setLabel('Load Data').setStyle(ButtonStyle.Secondary).setDisabled(s.savedItems.length === 0),
        new ButtonBuilder().setCustomId('mb:clear').setLabel('Clear All').setStyle(ButtonStyle.Danger),
      ),
    );
}

const LD_PAGE_SIZE = 24; // leave 1 slot for nav sentinels

function ctrlLoadData(s: BuilderSession): ContainerBuilder {
  const items      = s.savedItems;
  const totalPages = Math.max(1, Math.ceil(items.length / LD_PAGE_SIZE));
  const p          = Math.min(Math.max(s.dataPage, 0), totalPages - 1);
  const slice      = items.slice(p * LD_PAGE_SIZE, p * LD_PAGE_SIZE + LD_PAGE_SIZE);

  const options: StringSelectMenuOptionBuilder[] = [];
  if (p > 0) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('← Previous page').setValue('__prev__')
        .setDescription(`Page ${p} of ${totalPages}`),
    );
  }
  for (const item of slice) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(item.name.slice(0, 100)).setValue(item.name_lower)
        .setDescription('CV2 container · click to load into builder'),
    );
  }
  if (p < totalPages - 1) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('Next page →').setValue('__next__')
        .setDescription(`Page ${p + 2} of ${totalPages}`),
    );
  }

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Load Saved Data\n-# ${items.length} CV2 container(s) — Page ${p + 1} / ${totalPages}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mb:loaddata_sel')
          .setPlaceholder(`Choose a saved container… (${items.length} available, page ${p + 1}/${totalPages})`)
          .addOptions(options),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('mb:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
      ),
    );
}

function ctrlColor(s: BuilderSession): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Accent Color'),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# This is the colored stripe running down the left edge of the message.',
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mb:color_sel')
          .setPlaceholder('Pick a color…')
          .addOptions(
            ...Object.entries(PALETTE_LABELS).map(([key, label]) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(label)
                .setValue(key)
                .setDefault(key === s.hue),
            ),
          ),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('mb:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
      ),
    );
}

function ctrlEdit(s: BuilderSession): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Edit a Block'),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Pick a block below to change it.'),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mb:edit_sel')
          .setPlaceholder('Pick a block to edit…')
          .addOptions(...blockMenuOptions(s)),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('mb:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
      ),
    );
}

function ctrlRemove(s: BuilderSession): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Remove a Block'),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Pick a block to remove — this cannot be undone.'),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mb:remove_sel')
          .setPlaceholder('Pick a block to remove…')
          .addOptions(...blockMenuOptions(s)),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('mb:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
      ),
    );
}

function ctrlDuplicate(s: BuilderSession): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Duplicate a Block'),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Pick a block to copy. The copy is placed right after the original.',
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mb:duplicate_sel')
          .setPlaceholder('Pick a block to copy…')
          .addOptions(...blockMenuOptions(s)),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('mb:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
      ),
    );
}

function ctrlMove(s: BuilderSession): ContainerBuilder {
  const ri      = s.activeIdx;
  const canUp   = ri !== null && ri > 0;
  const canDown = ri !== null && ri < s.blocks.length - 1;
  const status  = ri !== null
    ? `-# Moving: **${blockTag(s.blocks[ri], ri).slice(0, 80)}**`
    : '-# Pick a block, then shift it up or down the list.';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Move a Block'),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(status),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mb:move_sel')
          .setPlaceholder('Pick a block to move…')
          .addOptions(...blockMenuOptions(s, true)),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('mb:up').setLabel('↑ Move Up').setStyle(ButtonStyle.Secondary).setDisabled(!canUp),
        new ButtonBuilder().setCustomId('mb:down').setLabel('↓ Move Down').setStyle(ButtonStyle.Secondary).setDisabled(!canDown),
        new ButtonBuilder().setCustomId('mb:back').setLabel('Done').setStyle(ButtonStyle.Primary),
      ),
    );
}

function ctrlSpacerEdit(s: BuilderSession): ContainerBuilder {
  const idx = s.activeIdx;
  const b   = idx !== null ? (s.blocks[idx] as SpacerBlock) : null;

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Set Up Spacer'),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Choose whether to show a visible line, and how much room it should take up.',
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mb:spacer_line')
          .setPlaceholder('Line style…')
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('Visible line')
              .setValue('yes')
              .setDescription('Draws a thin horizontal line')
              .setDefault(!!b?.line),
            new StringSelectMenuOptionBuilder()
              .setLabel('Invisible gap')
              .setValue('no')
              .setDescription('Just adds blank space, no line')
              .setDefault(b ? !b.line : false),
          ),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mb:spacer_size')
          .setPlaceholder('Gap size…')
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('Small gap')
              .setValue('sm')
              .setDefault(b?.size === 'sm'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Large gap')
              .setValue('lg')
              .setDefault(b?.size === 'lg'),
          ),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('mb:back').setLabel('Done').setStyle(ButtonStyle.Primary),
      ),
    );
}

function ctrlSend(): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Send To'),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Pick a channel from the list, or post it right here.',
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('mb:channel_sel')
          .setPlaceholder('Choose a channel…')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('mb:here').setLabel('Post Here').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mb:back').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      ),
    );
}

function ctrlDone(where: string): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Sent'),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Your message was posted to ${where}.`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('mb:clear').setLabel('Start a New One').setStyle(ButtonStyle.Secondary),
      ),
    );
}

function ctrlExpired(): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Message Builder'),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# This session timed out. Run `$container` again to start a new one.',
      ),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Full payload
// ─────────────────────────────────────────────────────────────────────────────

function payload(s: BuilderSession, expired = false, doneWhere?: string): any {
  let ctrl: ContainerBuilder;

  if (expired) {
    ctrl = ctrlExpired();
  } else {
    switch (s.mode) {
      case 'idle':       ctrl = ctrlIdle(s);                                   break;
      case 'color':      ctrl = ctrlColor(s);                                  break;
      case 'edit':       ctrl = ctrlEdit(s);                                   break;
      case 'remove':     ctrl = ctrlRemove(s);                                 break;
      case 'duplicate':  ctrl = ctrlDuplicate(s);                              break;
      case 'move':       ctrl = ctrlMove(s);                                   break;
      case 'spacerEdit': ctrl = ctrlSpacerEdit(s);                             break;
      case 'send':       ctrl = ctrlSend();                                    break;
      case 'done':       ctrl = ctrlDone(doneWhere ?? 'this channel');         break;
      case 'loaddata':   ctrl = ctrlLoadData(s);                               break;
    }
  }

  return {
    components:      [buildPreview(s), ctrl],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Modals (spacer has no modal — it's configured entirely via select menus)
// ─────────────────────────────────────────────────────────────────────────────

function modalText(token: string, existing?: TextBlock): ModalBuilder {
  const field = new TextInputBuilder()
    .setCustomId('content')
    .setLabel('What do you want to say?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Markdown works here: **bold**, *italic*, ### heading, > quote…')
    .setRequired(true)
    .setMaxLength(2000);
  if (existing?.content) field.setValue(existing.content);

  return new ModalBuilder()
    .setCustomId(`mb:modal:${token}:text`)
    .setTitle(existing ? 'Edit Text' : 'Add Text')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field));
}

function modalInfo(token: string, existing?: InfoBlock): ModalBuilder {
  const bodyField = new TextInputBuilder()
    .setCustomId('body')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);
  if (existing?.body) bodyField.setValue(existing.body);

  const imgField = new TextInputBuilder()
    .setCustomId('image')
    .setLabel('Picture link (leave blank for none)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('https://example.com/picture.png')
    .setMaxLength(500);
  if (existing?.image) imgField.setValue(existing.image);

  return new ModalBuilder()
    .setCustomId(`mb:modal:${token}:info`)
    .setTitle(existing ? 'Edit Info Card' : 'Add Info Card')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(bodyField),
      new ActionRowBuilder<TextInputBuilder>().addComponents(imgField),
    );
}

function modalPhotos(token: string, existing?: PhotosBlock): ModalBuilder {
  const field = new TextInputBuilder()
    .setCustomId('urls')
    .setLabel('Paste picture links, one per line (up to 10)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('https://example.com/one.png\nhttps://example.com/two.png')
    .setMaxLength(4000);
  if (existing?.urls.length) field.setValue(existing.urls.join('\n'));

  return new ModalBuilder()
    .setCustomId(`mb:modal:${token}:photos`)
    .setTitle(existing ? 'Edit Photo Grid' : 'Add Photo Grid')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field));
}

function modalLinks(token: string, existing?: LinksBlock): ModalBuilder {
  const existingText = existing?.items
    .map(l => (l.emoji ? `${l.emoji} | ${l.label} | ${l.url}` : `${l.label} | ${l.url}`))
    .join('\n') ?? '';

  const field = new TextInputBuilder()
    .setCustomId('items')
    .setLabel('One link per line: Label | https://url')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('Join Us | https://discord.gg/example\n🔗 | GitHub | https://github.com')
    .setMaxLength(1500);
  if (existingText) field.setValue(existingText);

  return new ModalBuilder()
    .setCustomId(`mb:modal:${token}:links`)
    .setTitle(existing ? 'Edit Quick Links' : 'Add Quick Links')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field));
}

function buildModal(type: Exclude<BlockType, 'spacer'>, token: string, existing?: Block): ModalBuilder {
  switch (type) {
    case 'text':   return modalText(token,   existing as TextBlock   | undefined);
    case 'info':   return modalInfo(token,   existing as InfoBlock   | undefined);
    case 'photos': return modalPhotos(token, existing as PhotosBlock | undefined);
    case 'links':  return modalLinks(token,  existing as LinksBlock  | undefined);
  }
}

function modalId(type: Exclude<BlockType, 'spacer'>, token: string): string {
  return `mb:modal:${token}:${type}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal parsers — use getTextInputValue (mirrors steal.ts approach)
// ─────────────────────────────────────────────────────────────────────────────

function tv(fields: any, id: string): string {
  try { return (fields.getTextInputValue(id) ?? '').trim(); }
  catch { return ''; }
}

function parseText(fields: any): TextBlock {
  return { type: 'text', content: tv(fields, 'content') };
}

function parseInfo(fields: any): InfoBlock {
  const body  = tv(fields, 'body');
  const rawU  = tv(fields, 'image');
  const image = rawU.startsWith('http') ? rawU : null;
  return { type: 'info', body, image };
}

function parsePhotos(fields: any): PhotosBlock {
  const urls = tv(fields, 'urls')
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.startsWith('http://') || l.startsWith('https://'))
    .slice(0, 10);
  return { type: 'photos', urls };
}

function parseLinks(fields: any): LinksBlock | null {
  const items: { label: string; url: string; emoji?: string }[] = [];

  for (const line of tv(fields, 'items').split('\n')) {
    const parts = line.split('|').map((p: string) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    // Last part = URL, second-to-last = label, optional first part = emoji
    const url   = parts[parts.length - 1];
    const label = parts[parts.length - 2].slice(0, 80);
    const emoji = parts.length >= 3 ? parts[0] : undefined;

    if (label && (url.startsWith('http://') || url.startsWith('https://'))) {
      items.push({ label, url, ...(emoji ? { emoji } : {}) });
    }
  }

  if (items.length === 0) return null;
  return { type: 'links', items: items.slice(0, 5) };
}

function parseBlock(type: Exclude<BlockType, 'spacer'>, fields: any): Block | null {
  switch (type) {
    case 'text':   return parseText(fields);
    case 'info':   return parseInfo(fields);
    case 'photos': return parsePhotos(fields);
    case 'links':  return parseLinks(fields);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// awaitModalSubmit — identical pattern to steal.ts
// ─────────────────────────────────────────────────────────────────────────────

function awaitModal(
  client:    CassieClient,
  customId:  string,
  userId:    string,
  ms:        number,
): Promise<any | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.removeListener('interactionCreate', handler);
      resolve(null);
    }, ms);

    function handler(ix: any): void {
      if (
        ix.isModalSubmit?.() &&
        ix.customId === customId &&
        ix.user?.id === userId
      ) {
        clearTimeout(timer);
        client.removeListener('interactionCreate', handler);
        resolve(ix);
      }
    }

    client.on('interactionCreate', handler);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch: show modal, await submit, parse, update message
// Uses submit.update(payload) — response type 6 (UPDATE_MESSAGE) — which is
// the correct single-call way to both acknowledge and edit for CV2 messages.
// ─────────────────────────────────────────────────────────────────────────────

async function doModal(
  s:         BuilderSession,
  ix:        any,            // the component interaction that opens the modal
  type:      Exclude<BlockType, 'spacer'>,
  token:     string,
  existing?: Block,          // if editing
  idx?:      number,         // if editing, position to replace
): Promise<void> {
  const modal = buildModal(type, token, existing);
  await ix.showModal(modal).catch((): null => null);

  const submit = await awaitModal(s.client, modalId(type, token), s.authorId, 120_000);
  if (!submit) return;

  const block = parseBlock(type, submit.fields);

  if (block === null) {
    // Quick Links had no valid entries — respond ephemerally so the interaction is acknowledged
    await submit.reply({
      content:   'No valid links found. Format: `Label | https://url`',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  if (idx !== undefined) {
    s.blocks[idx] = block;
  } else {
    s.blocks.push(block);
  }

  s.mode = 'idle';

  // submit.update() — response type 6 — acknowledges the modal submit AND
  // updates the original builder message in one request.
  await submit.update(payload(s)).catch((): null => null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Emit a finished container to a target channel
// ─────────────────────────────────────────────────────────────────────────────

async function emit(s: BuilderSession, target: any): Promise<boolean> {
  const c = buildOutputContainer(s);

  try {
    await target.send({
      components:      [c],
      flags:           MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Save as Data — persists the finished container into the shared data system
// (same storage as $create-data / $view-data / $send-data), so it can be
// reused later via `$send-data` or in greet/sticky messages.
// ─────────────────────────────────────────────────────────────────────────────

async function doSaveAsData(
  s:       BuilderSession,
  ix:      any,
  message: any,
  client:  CassieClient,
  token:   string,
): Promise<void> {
  const modalCid = `mb:modal:${token}:savename`;
  const modal = new ModalBuilder()
    .setCustomId(modalCid)
    .setTitle('Save as Data')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Name this saved data')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. Welcome Message')
          .setRequired(true)
          .setMaxLength(SAVE_NAME_MAX),
      ),
    );

  await ix.showModal(modal).catch((): null => null);

  const submit = await awaitModal(client, modalCid, s.authorId, 120_000);
  if (!submit) return;

  const name = tv(submit.fields, 'name');
  if (!name) {
    await submit.reply({
      content:   'Name cannot be empty. Try **Save as Data** again.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  await submit.deferReply({ flags: MessageFlags.Ephemeral }).catch((): null => null);

  const guildId = message.guild.id;

  let exists: boolean;
  try {
    exists = await client.db.savedDataNameExists(guildId, name);
  } catch {
    await submit.editReply({
      content: 'Database error while checking name availability. Please try again.',
    }).catch((): null => null);
    return;
  }

  if (exists) {
    await submit.editReply({
      content: `A saved item named \`${name}\` already exists in this server. Pick a different name.`,
    }).catch((): null => null);
    return;
  }

  const storageChannelId = config.savedDataChannelId?.trim();
  const storageChannel: any = storageChannelId
    ? (client.channels.cache.get(storageChannelId) ??
       await client.channels.fetch(storageChannelId).catch((): null => null))
    : null;

  if (!storageChannel || typeof storageChannel.send !== 'function') {
    await submit.editReply({
      content: 'Could not reach the saved-data storage channel. Check the bot configuration.',
    }).catch((): null => null);
    return;
  }

  const finalContainer = buildOutputContainer(s);
  const rawJson = JSON.stringify(finalContainer.toJSON(), null, 2);

  const safeFileName = name
    .replace(/[^a-z0-9_\-. ]/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  const attachment = new AttachmentBuilder(Buffer.from(rawJson, 'utf-8'), {
    name: `${safeFileName}.json`,
  });

  const unixSec = Math.floor(Date.now() / 1000);
  const metaText =
    `**Server:** ${message.guild.name} (\`${guildId}\`)\n` +
    `**User:** ${message.author.tag ?? message.author.username} (<@${message.author.id}> \`${message.author.id}\`)\n` +
    `**Name:** \`${name}\`\n` +
    `**Type:** CV2\n` +
    `**Time:** <t:${unixSec}:F> (<t:${unixSec}:R>)`;

  const storageMsg = await storageChannel.send({
    content:         metaText,
    files:           [attachment],
    allowedMentions: { parse: [] },
  }).catch((): null => null);

  if (!storageMsg) {
    await submit.editReply({
      content: 'Failed to post the payload to the storage channel.',
    }).catch((): null => null);
    return;
  }

  await storageChannel.send({
    content:         config.dataDivider,
    allowedMentions: { parse: [] },
  }).catch((): null => null);

  const saveResult = await client.db.createSavedData({
    name,
    guildId,
    messageId: storageMsg.id,
    type:      'cv2',
    createdBy: s.authorId,
  });

  if (saveResult === 'duplicate') {
    await submit.editReply({
      content: `A name conflict was detected while saving (message ID \`${storageMsg.id}\` was posted, but not recorded). Pick a different name and try again.`,
    }).catch((): null => null);
    return;
  }

  if (saveResult === false) {
    await submit.editReply({
      content: `The payload was posted (message ID \`${storageMsg.id}\`) but the database write failed.`,
    }).catch((): null => null);
    return;
  }

  await submit.editReply({
    content: `${emojis.blacktick} Saved as \`${name}\`. Use \`$send-data\` or \`$view-data\` to send it later.`,
  }).catch((): null => null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved CV2 JSON → BuilderSession state reverse parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a raw ContainerBuilder.toJSON() payload back to blocks[] + hue.
 * Discord component types used here:
 *   1  = ActionRow, 2  = Button (style 5 = Link),
 *   9  = Section,   10 = TextDisplay,
 *   14 = Separator, 16 = MediaGallery, 17 = Container
 * SeparatorSpacingSize: Small = 1, Large = 2
 */
function componentJsonToState(rawJson: any): { blocks: Block[]; hue: string } {
  // The saved payload is the raw toJSON() of a single ContainerBuilder (type 17).
  const containerData: any =
    Array.isArray(rawJson)     ? rawJson.find((c: any) => c.type === 17) ?? rawJson[0] :
    rawJson.type === 17        ? rawJson :
    { components: [rawJson] }; // fallback: treat root as a single component

  const children: any[] = Array.isArray(containerData?.components) ? containerData.components : [];
  const blocks: Block[] = [];

  for (const child of children) {
    switch (child.type) {
      case 10: { // TextDisplay
        if (child.content) blocks.push({ type: 'text', content: child.content });
        break;
      }
      case 14: { // Separator — spacing 2 = Large, 1 (or absent) = Small
        blocks.push({ type: 'spacer', line: !!child.divider, size: child.spacing === 2 ? 'lg' : 'sm' });
        break;
      }
      case 9: { // Section — TextDisplay + optional Thumbnail accessory
        const textComp: any = (child.components ?? []).find((c: any) => c.type === 10);
        const thumbUrl: string | null = child.accessory?.media?.url ?? null;
        if (textComp?.content) blocks.push({ type: 'info', body: textComp.content, image: thumbUrl });
        break;
      }
      case 16: { // MediaGallery
        const urls: string[] = (child.items ?? [])
          .map((item: any) => item.media?.url)
          .filter(Boolean);
        if (urls.length > 0) blocks.push({ type: 'photos', urls });
        break;
      }
      case 1: { // ActionRow — may contain Link buttons (type 2, style 5)
        const linkBtns: any[] = (child.components ?? []).filter((c: any) => c.type === 2 && c.style === 5);
        if (linkBtns.length > 0) {
          blocks.push({
            type: 'links',
            items: linkBtns.map((btn: any) => ({
              label: btn.label ?? '',
              url:   btn.url   ?? '',
              ...(btn.emoji ? { emoji: btn.emoji.name ?? btn.emoji.id } : {}),
            })),
          });
        }
        break;
      }
    }
  }

  // Restore accent color → hue key
  const accentColor: number | undefined = containerData?.accent_color ?? containerData?.accentColor;
  const hue = accentColor !== undefined
    ? (Object.entries(PALETTE).find(([, v]) => v === accentColor)?.[0] ?? 'none')
    : 'none';

  return { blocks, hue };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function startBuilderSession(
  message:  any,
  client:   CassieClient,
  authorId: string,
): Promise<void> {
  // Pre-fetch saved CV2 entries for this guild so the Load Data button state
  // is correct on first render without an extra round-trip.
  const allItems: any[] = client.db
    ? await client.db.listSavedData(message.guild.id).catch((): any[] => [])
    : [];
  const cv2Items = allItems.filter((item: any) => item.type === 'cv2');

  const s: BuilderSession = {
    authorId,
    hue:        'none',
    blocks:     [],
    mode:       'idle',
    activeIdx:  null,
    client,
    msg:        null as any,
    savedItems: cv2Items,
    dataPage:   0,
  };

  const msg = await message.channel.send(payload(s)).catch((): null => null);
  if (!msg) return;

  s.msg = msg;
  builderSessions.set(msg.id, s);

  const token = msg.id;

  const collector = msg.createMessageComponentCollector({
    filter: (ix: any) => authorOnlyFilter(ix, authorId),
    time:   SESSION_MS,
  });

  collector.on('collect', async (ix: any) => {
    const cid = ix.customId as string;

    // ── Back / cancel ────────────────────────────────────────────────────────
    if (cid === 'mb:back') {
      s.mode      = 'idle';
      s.activeIdx = null;
      await ix.update(payload(s));
      return;
    }

    // ── Open mode panels ─────────────────────────────────────────────────────
    if (cid === 'mb:edit')      { s.mode = 'edit';      await ix.update(payload(s)); return; }
    if (cid === 'mb:remove')    { s.mode = 'remove';    await ix.update(payload(s)); return; }
    if (cid === 'mb:duplicate') { s.mode = 'duplicate'; await ix.update(payload(s)); return; }
    if (cid === 'mb:color')     { s.mode = 'color';     await ix.update(payload(s)); return; }
    if (cid === 'mb:send')      { s.mode = 'send';      await ix.update(payload(s)); return; }

    // ── Load Data ─────────────────────────────────────────────────────────────
    if (cid === 'mb:loaddata') {
      // Refresh list (in case items were saved since session start), then open picker
      await ix.deferUpdate().catch((): null => null);
      const all: any[] = client.db
        ? await client.db.listSavedData(message.guild.id).catch((): any[] => [])
        : [];
      s.savedItems = all.filter((item: any) => item.type === 'cv2');
      s.dataPage   = 0;
      s.mode       = 'loaddata';
      await s.msg.edit(payload(s)).catch((): null => null);
      return;
    }

    if (cid === 'mb:loaddata_sel') {
      const value = (ix.values?.[0] ?? '') as string;

      // Pagination sentinels — synchronous state change
      if (value === '__next__') { s.dataPage++; await ix.update(payload(s)); return; }
      if (value === '__prev__') { s.dataPage = Math.max(0, s.dataPage - 1); await ix.update(payload(s)); return; }

      // Real item — async fetch, so defer first
      await ix.deferUpdate().catch((): null => null);

      const doLoad = async (): Promise<void> => {
        if (!client.db) return;

        const entry = await client.db.getSavedData(message.guild.id, value).catch((): null => null);
        if (!entry) return;

        const storageChannelId: string = (client.config as any).savedDataChannelId ?? '';
        const storageChannel: any = storageChannelId
          ? (client.channels.cache.get(storageChannelId) ??
             await client.channels.fetch(storageChannelId).catch((): null => null))
          : null;
        if (!storageChannel) return;

        const storageMsg: any = await storageChannel.messages.fetch(entry.message_id).catch((): null => null);
        const attachment = storageMsg?.attachments?.first?.();
        if (!attachment) return;

        let raw: string;
        try {
          const res = await fetch(attachment.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          raw = (await res.text()).trim();
        } catch { return; }

        try {
          const json = JSON.parse(raw);
          const { blocks, hue } = componentJsonToState(json);
          s.blocks = blocks.slice(0, MAX_BLOCKS);
          s.hue    = hue;
        } catch { /* malformed JSON — leave session state unchanged */ }
      };

      await doLoad();
      s.mode      = 'idle';
      s.activeIdx = null;
      await s.msg.edit(payload(s)).catch((): null => null);
      return;
    }

    // ── Save as Data ─────────────────────────────────────────────────────────
    if (cid === 'mb:savedata') {
      if (s.blocks.length === 0) { await ix.update(payload(s)); return; }

      if (!ix.memberPermissions?.has?.('Administrator')) {
        await ix.reply({
          content:   'You need the **Administrator** permission to save this as data.',
          flags: MessageFlags.Ephemeral,
        }).catch((): null => null);
        return;
      }

      if (!client.db) {
        await ix.reply({ content: 'Database is unavailable right now.', flags: MessageFlags.Ephemeral }).catch((): null => null);
        return;
      }

      await doSaveAsData(s, ix, message, client, token);
      return;
    }

    if (cid === 'mb:move') {
      s.mode      = 'move';
      s.activeIdx = null;
      await ix.update(payload(s));
      return;
    }

    // ── Clear all ────────────────────────────────────────────────────────────
    if (cid === 'mb:clear') {
      s.hue       = 'none';
      s.blocks    = [];
      s.mode      = 'idle';
      s.activeIdx = null;
      await ix.update(payload(s));
      return;
    }

    // ── Color select ─────────────────────────────────────────────────────────
    if (cid === 'mb:color_sel') {
      s.hue  = ix.values[0];
      s.mode = 'idle';
      await ix.update(payload(s));
      return;
    }

    // ── Remove select ────────────────────────────────────────────────────────
    if (cid === 'mb:remove_sel') {
      const idx = parseInt(ix.values[0], 10);
      s.blocks.splice(idx, 1);
      if (s.activeIdx !== null && s.activeIdx >= s.blocks.length) {
        s.activeIdx = s.blocks.length > 0 ? s.blocks.length - 1 : null;
      }
      s.mode = 'idle';
      await ix.update(payload(s));
      return;
    }

    // ── Duplicate select ─────────────────────────────────────────────────────
    if (cid === 'mb:duplicate_sel') {
      const idx = parseInt(ix.values[0], 10);
      if (s.blocks.length < MAX_BLOCKS) {
        s.blocks.splice(idx + 1, 0, JSON.parse(JSON.stringify(s.blocks[idx])));
      }
      s.mode = 'idle';
      await ix.update(payload(s));
      return;
    }

    // ── Move select ──────────────────────────────────────────────────────────
    if (cid === 'mb:move_sel') {
      s.activeIdx = parseInt(ix.values[0], 10);
      await ix.update(payload(s));
      return;
    }

    if (cid === 'mb:up') {
      const ri = s.activeIdx;
      if (ri !== null && ri > 0) {
        [s.blocks[ri], s.blocks[ri - 1]] = [s.blocks[ri - 1], s.blocks[ri]];
        s.activeIdx = ri - 1;
      }
      await ix.update(payload(s));
      return;
    }

    if (cid === 'mb:down') {
      const ri = s.activeIdx;
      if (ri !== null && ri < s.blocks.length - 1) {
        [s.blocks[ri], s.blocks[ri + 1]] = [s.blocks[ri + 1], s.blocks[ri]];
        s.activeIdx = ri + 1;
      }
      await ix.update(payload(s));
      return;
    }

    // ── Spacer setup — select-menu based, no modal ──────────────────────────
    if (cid === 'mb:spacer_line') {
      const idx = s.activeIdx;
      if (idx !== null && s.blocks[idx]?.type === 'spacer') {
        (s.blocks[idx] as SpacerBlock).line = ix.values[0] === 'yes';
      }
      await ix.update(payload(s));
      return;
    }

    if (cid === 'mb:spacer_size') {
      const idx = s.activeIdx;
      if (idx !== null && s.blocks[idx]?.type === 'spacer') {
        (s.blocks[idx] as SpacerBlock).size = ix.values[0] === 'lg' ? 'lg' : 'sm';
      }
      await ix.update(payload(s));
      return;
    }

    // ── Post Here ────────────────────────────────────────────────────────────
    if (cid === 'mb:here') {
      const ok = await emit(s, message.channel);
      if (!ok) {
        await ix.reply({ content: "I don't have permission to post here.", flags: MessageFlags.Ephemeral });
        return;
      }
      s.mode = 'done';
      await ix.update(payload(s, false, message.channel.toString()));
      return;
    }

    // ── Channel select → post ────────────────────────────────────────────────
    if (cid === 'mb:channel_sel') {
      const target = ix.channels?.first?.();
      if (!target) {
        await ix.reply({ content: 'Could not resolve that channel.', flags: MessageFlags.Ephemeral });
        return;
      }
      const ok = await emit(s, target);
      if (!ok) {
        await ix.reply({
          content:   `I don't have permission to post in ${target.toString()}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      s.mode = 'done';
      await ix.update(payload(s, false, target.toString()));
      return;
    }

    // ── Insert ───────────────────────────────────────────────────────────────
    if (cid === 'mb:insert') {
      const type = ix.values[0] as BlockType;

      if (type === 'spacer') {
        if (s.blocks.length >= MAX_BLOCKS) { await ix.update(payload(s)); return; }
        const block: SpacerBlock = { type: 'spacer', line: true, size: 'sm' };
        s.blocks.push(block);
        s.activeIdx = s.blocks.length - 1;
        s.mode      = 'spacerEdit';
        await ix.update(payload(s));
        return;
      }

      await doModal(s, ix, type, token);
      return;
    }

    // ── Edit select → modal or spacer panel ─────────────────────────────────
    if (cid === 'mb:edit_sel') {
      const idx      = parseInt(ix.values[0], 10);
      const existing = s.blocks[idx];

      if (existing.type === 'spacer') {
        s.activeIdx = idx;
        s.mode      = 'spacerEdit';
        await ix.update(payload(s));
        return;
      }

      await doModal(s, ix, existing.type, token, existing, idx);
      return;
    }
  });

  // ── Timeout ────────────────────────────────────────────────────────────────
  collector.on('end', async () => {
    builderSessions.delete(msg.id);
    await msg.edit(payload(s, true)).catch((): null => null);
  });
}
