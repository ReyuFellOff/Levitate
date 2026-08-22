import { config } from '../../config.js';
// xoxo/components/features/reactionroles.ts
//
// Components V2 panel for adding emoji/role mappings to an existing message.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import type { ReactionRolePair } from '../../database/database.js';
import {
  buildActionCancelledPayload,
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
} from '../purgeConfirm.js';
import { emojis } from '../../emojis.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';
import {
  REACTION_ROLE_MAX_PAIRS,
  buildReactionRolePair,
  reactionRoleEmojiDisplay,
} from '../../helpers/reactionRoles.js';
import { escapeFormatting } from '../../utils/formatting.js';

const TIMEOUT_MS = 10 * 60_000;

interface ReactionRoleSession {
  scopeId: string;
  userId: string;
  guildId: string;
  panelChannelId: string;
  panelMessageId: string;
  targetChannelId: string;
  targetMessageId: string;
  pairs: ReactionRolePair[];
  allowMultiple: boolean;
  client: LevitateClient;
}

const sessions = new Map<string, ReactionRoleSession>();
const timeouts = new Map<string, NodeJS.Timeout>();

function payload(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function ephemeralNotice(content: string): any {
  return {
    components: [
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(content),
      ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function title(text = 'Reaction Roles'): string {
  return `## ${emojis.blackCards} ${text}`;
}

function pairLines(pairs: ReactionRolePair[], guild: any): string {
  if (!pairs.length) return '*No reaction roles added yet.*';
  return pairs.map((pair, index) => {
    const role = guild.roles.cache.get(pair.role_id);
    return `**${index + 1}.** ${pair.emoji} : \`${escapeFormatting(pair.role_label || role?.name || pair.role_id)}\``;
  }).join('\n');
}

function panelContainer(
  session: ReactionRoleSession,
  guild: any,
  disabled = false,
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(title()))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `**Message:** <#${session.targetChannelId}> — \`${session.targetMessageId}\``,
      '',
      `**Mappings (${session.pairs.length}/${REACTION_ROLE_MAX_PAIRS})**`,
      pairLines(session.pairs, guild),
      '',
      `**Selection mode:** ${session.allowMultiple ? 'Multiple reaction roles' : 'One reaction role at a time'}`,
      '',
      disabled
        ? '-# This panel has expired. Run the command again.'
        : 'Add emoji and role pairs, then save when you are finished. Change the selection mode with the mode command.',
    ].join('\n')));

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rr:add:${session.scopeId}`)
        .setLabel('Add Emoji + Role')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || session.pairs.length >= REACTION_ROLE_MAX_PAIRS),
      new ButtonBuilder()
        .setCustomId(`rr:save:${session.scopeId}`)
        .setLabel('Save')
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled || session.pairs.length === 0),
      new ButtonBuilder()
        .setCustomId(`rr:cancel:${session.scopeId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    ),
  );

  return container;
}

function resultContainer(header: string, body: string): any {
  return payload(
    new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(title(header)))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(body)),
  );
}

const RESET_TITLE = 'Confirm Reaction Role Reset';

function resetDescription(count: number): string {
  return [
    `Are you sure you want to reset reaction roles in this server?`,
    '',
    `This will remove **${count}** configured reaction-role message${count === 1 ? '' : 's'} and the bot's matching reactions from those messages.`,
    '**This action cannot be undone.**',
  ].join('\n');
}

export function buildReactionRolesResetConfirmPayload(
  confirmId: string,
  cancelId: string,
  count: number,
): any {
  return buildActionConfirmPayload(confirmId, cancelId, RESET_TITLE, resetDescription(count));
}

export function buildReactionRolesResetTimedOutPayload(
  confirmId: string,
  cancelId: string,
  count: number,
): any {
  return buildActionTimedOutPayload(confirmId, cancelId, RESET_TITLE, resetDescription(count));
}

export function buildReactionRolesResetCancelledPayload(
  confirmId: string,
  cancelId: string,
  count: number,
): any {
  return buildActionCancelledPayload(confirmId, cancelId, RESET_TITLE, resetDescription(count));
}

export function buildReactionRolesResetResultPayload(
  deleted: number,
  unavailable: number,
): any {
  const unavailableLine = unavailable
    ? `\n-# ${unavailable} message${unavailable === 1 ? '' : 's'} could not be fetched, but their database configuration was removed.`
    : '';
  return resultContainer(
    'Reaction Roles Reset',
    `Removed **${deleted}** reaction-role message configuration${deleted === 1 ? '' : 's'} from this server.${unavailableLine}`,
  );
}

function clearSession(scopeId: string): void {
  sessions.delete(scopeId);
  const timeout = timeouts.get(scopeId);
  if (timeout) clearTimeout(timeout);
  timeouts.delete(scopeId);
}

function resetTimeout(scopeId: string): void {
  const oldTimeout = timeouts.get(scopeId);
  if (oldTimeout) clearTimeout(oldTimeout);
  const session = sessions.get(scopeId);
  if (!session) return;

  timeouts.set(scopeId, setTimeout(async () => {
    const current = sessions.get(scopeId);
    if (!current) return;
    clearSession(scopeId);
    try {
      const channel = await current.client.channels.fetch(current.panelChannelId) as any;
      const message = await channel.messages.fetch(current.panelMessageId);
      await message.edit(payload(panelContainer(current, channel.guild, true)));
    } catch {
      // The panel may have been deleted or become inaccessible.
    }
  }, TIMEOUT_MS));
}

function getSession(customId: string): ReactionRoleSession | null {
  return sessions.get(customId.split(':').pop() ?? '') ?? null;
}

function makePairModal(scopeId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`rr:pair-modal:${scopeId}`)
    .setTitle('Add Reaction Role')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('rr:emoji')
          .setLabel('Reaction emoji')
          .setPlaceholder('Unicode emoji, custom emoji, ID, or name')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('rr:role')
          .setLabel('Role')
          .setPlaceholder('Mention, ID, or role name')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true),
      ),
    );
}

async function replyEphemeral(interaction: any, content: string): Promise<void> {
  await interaction.reply(ephemeralNotice(content)).catch((): null => null);
}

export async function startReactionRolePanel(
  context: { message?: any; interaction?: any },
  client: LevitateClient,
  targetMessage: any,
  existingPairs: ReactionRolePair[] = [],
  existingAllowMultiple = false,
): Promise<void> {
  const guild = context.message?.guild ?? context.interaction?.guild;
  const user = context.message?.author ?? context.interaction?.user;
  if (!guild || !user || !targetMessage?.channelId || !targetMessage?.id) return;

  const scopeId = `${user.id}-${Date.now().toString(36)}`;
  const session: ReactionRoleSession = {
    scopeId,
    userId: user.id,
    guildId: guild.id,
    panelChannelId: context.message?.channelId ?? context.interaction?.channelId,
    panelMessageId: '',
    targetChannelId: targetMessage.channelId,
    targetMessageId: targetMessage.id,
    pairs: [...existingPairs],
    allowMultiple: existingAllowMultiple,
    client,
  };
  const initial = payload(panelContainer(session, guild));
  let sent: any;

  if (context.interaction) {
    sent = await context.interaction.reply({ ...initial, fetchReply: true });
  } else {
    sent = await context.message.channel.send(initial);
  }

  session.panelMessageId = sent.id;
  session.panelChannelId = sent.channelId ?? session.panelChannelId;
  sessions.set(scopeId, session);
  resetTimeout(scopeId);
}

export async function handleReactionRoleInteraction(
  interaction: any,
  client: LevitateClient,
): Promise<void> {
  const session = getSession(interaction.customId as string);
  if (!session || session.guildId !== interaction.guildId) {
    await replyEphemeral(interaction, 'This reaction-role panel has expired. Run the command again.');
    return;
  }
  if (interaction.user?.id !== session.userId) {
    await replyEphemeral(interaction, 'Only the person who opened this panel can use it.');
    return;
  }
  if (!interaction.member?.permissions?.has?.('ManageGuild')) {
    await replyEphemeral(interaction, 'You need the **Manage Server** permission to use this panel.');
    return;
  }

  const action = (interaction.customId as string).split(':')[1];

  if (action === 'add' && interaction.isButton?.()) {
    if (session.pairs.length >= REACTION_ROLE_MAX_PAIRS) {
      await replyEphemeral(interaction, `A message can have at most ${REACTION_ROLE_MAX_PAIRS} reaction roles.`);
      return;
    }
    await interaction.showModal(makePairModal(session.scopeId)).catch((): null => null);
    return;
  }

  if (action === 'cancel' && interaction.isButton?.()) {
    clearSession(session.scopeId);
    await interaction.update(resultContainer('Cancelled', 'No reaction-role changes were saved.'));
    return;
  }

  if (action === 'save' && interaction.isButton?.()) {
    await interaction.deferUpdate();
    const targetChannel = interaction.guild.channels.cache.get(session.targetChannelId)
      ?? await interaction.guild.channels.fetch(session.targetChannelId).catch((): null => null);
    const target = targetChannel?.messages
      ? await targetChannel.messages.fetch(session.targetMessageId).catch((): null => null)
      : null;
    if (!target) {
      clearSession(session.scopeId);
      await interaction.editReply(resultContainer('Could Not Save', 'The target message could not be found.'));
      return;
    }

    const result = await client.db!.saveReactionRoleMessage({
      guild_id: session.guildId,
      channel_id: session.targetChannelId,
      message_id: session.targetMessageId,
      pairs: session.pairs,
      allow_multiple: session.allowMultiple,
      created_by: session.userId,
    });
    if (result === 'limit') {
      await interaction.editReply(resultContainer('Could Not Save', 'This server already has the maximum of 5 reaction-role messages.'));
      return;
    }
    if (!result) {
      await interaction.editReply(resultContainer('Could Not Save', 'The reaction roles could not be saved. Please try again.'));
      return;
    }

    for (const pair of session.pairs) {
      const resolved = await resolveEmoji(client, pair.emoji, interaction.guild);
      if (resolved) await target.react(resolved as any).catch((): null => null);
    }

    clearSession(session.scopeId);
    await interaction.editReply(resultContainer(
      'Saved',
      `Saved **${session.pairs.length}** reaction role${session.pairs.length === 1 ? '' : 's'} for <#${session.targetChannelId}> — \`${session.targetMessageId}\`.`,
    ));
    return;
  }

  if (action === 'pair-modal' && interaction.isModalSubmit?.()) {
    const rawEmoji = interaction.fields.getTextInputValue('rr:emoji').trim();
    const rawRole = interaction.fields.getTextInputValue('rr:role').trim();
    const result = await buildReactionRolePair(
      client,
      interaction.guild,
      rawEmoji,
      rawRole,
      session.userId,
      session.pairs,
    );
    if (!result.pair) {
      await replyEphemeral(interaction, result.error ?? 'That emoji-role pair is invalid.');
      return;
    }

    session.pairs.push(result.pair);
    await interaction.deferUpdate();
    try {
      const panelChannel = await client.channels.fetch(session.panelChannelId) as any;
      const panelMessage = await panelChannel.messages.fetch(session.panelMessageId);
      await panelMessage.edit(payload(panelContainer(session, interaction.guild)));
    } catch {
      await interaction.followUp(ephemeralNotice('The pair was added, but I could not refresh the panel.')).catch((): null => null);
    }
    resetTimeout(session.scopeId);
  }
}