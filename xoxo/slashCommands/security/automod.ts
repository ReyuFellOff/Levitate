// xoxo/slashCommands/security/automod.ts
//
// /automod — Opens the AutoMod interactive configuration panel.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildAutomodHomePayload,
  registerAutomodSession,
  type AutomodSession,
} from '../../components/automod/automodPanel.js';

export const options = {
  name:        'automod',
  description: 'Configure automatic message moderation for this server.',
  category:    'security',
  owner:       false,
};

export const data = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Configure automatic message moderation for this server.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  if (!interaction.guild) return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'You need **Manage Server** permission to configure AutoMod.', flags: 64 });
  }

  if (!client.db) return interaction.reply({ content: 'Database unavailable.', flags: 64 });

  const config = await client.db.getAutomodConfig(interaction.guild.id).catch((): null => null);
  if (!config) return interaction.reply({ content: 'Failed to load AutoMod config.', flags: 64 });

  // Defer and send panel
  await interaction.deferReply();
  const panel = await interaction.fetchReply();
  const msgId = panel.id;

  await interaction.editReply(buildAutomodHomePayload(config, msgId));

  const session: AutomodSession = {
    userId:    interaction.user.id,
    guildId:   interaction.guild.id,
    channelId: interaction.channel.id,
    page:      'home',
    draft:     {},
    client,
  };
  registerAutomodSession(msgId, session);
}
