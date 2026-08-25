// xoxo/commands/moderation/clearwarnings.ts
//
// Clear all warnings for a member. Destructive — always asks for confirmation.
//
// Prefix:  $clearwarnings <@user|ID|username>
// Slash:   /clearwarnings user:<user>

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildClearWarningsResultPayload } from '../../components/moderation/warn.js';
import { buildModLogClearWarnings } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
  buildActionCancelledPayload,
} from '../../components/purgeConfirm.js';

export const options = {
  name:        'clearwarnings',
  aliases:     ['clearwarns'] as string[],
  description: "Clear all of a member's warnings.",
  usage:       'clearwarnings <@user|ID|username>',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

const CONFIRM_TITLE = 'Confirm Clear Warnings';

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!args[0])
    return sendError(ctx, `**Usage:** \`${client.config.prefix}${options.usage}\``);

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  const count = await client.db.countWarnings(message.guild.id, targetUser.id);
  if (count === 0) return sendError(ctx, `**${targetUser.username}** has no warnings to clear.`);

  const desc = `Are you sure you want to clear **${count}** warning${count !== 1 ? 's' : ''} for **${targetUser.username}**?`;
  const confirmId = `cw:confirm:${message.id}`;
  const cancelId  = `cw:cancel:${message.id}`;

  const confirmMsg = await message.channel
    .send(buildActionConfirmPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
    .catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, message.author.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await client.db.clearWarnings(message.guild.id, targetUser.id);
      await confirmMsg.edit(buildClearWarningsResultPayload(targetUser, count)).catch((): null => null);
      sendModLog(client, message.guild.id, buildModLogClearWarnings(targetUser, count, message.author.username));
    } else {
      await confirmMsg
        .edit(buildActionCancelledPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
        .catch((): null => null);
    }
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildActionTimedOutPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
      .catch((): null => null);
  });
}

export async function slashExecute(
  interaction: any,
  client:      CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };

  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const targetUser = interaction.options.getUser('user', true);
  const count = await client.db.countWarnings(interaction.guild.id, targetUser.id);
  if (count === 0) return sendError(ctx, `**${targetUser.username}** has no warnings to clear.`);

  const desc = `Are you sure you want to clear **${count}** warning${count !== 1 ? 's' : ''} for **${targetUser.username}**?`;
  const confirmId = `cw:confirm:${interaction.id}`;
  const cancelId  = `cw:cancel:${interaction.id}`;

  await interaction.editReply(buildActionConfirmPayload(confirmId, cancelId, CONFIRM_TITLE, desc));
  const confirmMsg = await interaction.fetchReply().catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, interaction.user.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await client.db.clearWarnings(interaction.guild.id, targetUser.id);
      await interaction.editReply(buildClearWarningsResultPayload(targetUser, count)).catch((): null => null);
      sendModLog(client, interaction.guild.id, buildModLogClearWarnings(targetUser, count, interaction.user.username));
    } else {
      await i
        .editReply(buildActionCancelledPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
        .catch((): null => null);
    }
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildActionTimedOutPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
      .catch((): null => null);
  });
}
