// xoxo/commands/music/skipto.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';

export const options = {
  name: 'skipto',
  aliases: ['st', 'jumpto', 'jt'] as string[],
  description: 'Skip to a specific track in the queue.',
  usage: 'skipto <position>',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 3,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, posArg: string | null, client: CassieClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');
  if (!player.queue.length) return sendError(ctxObj, 'There are no upcoming tracks to skip to.');

  if (!posArg) return sendError(ctxObj, 'Please provide a queue position to skip to.');

  const pos = parseInt(posArg, 10);
  if (isNaN(pos) || pos < 1 || pos > player.queue.length) {
    return sendError(ctxObj, `Position must be between **1** and **${player.queue.length}**.`);
  }

  const target = player.queue[pos - 1];

  // Remove all tracks before the target position
  for (let i = 0; i < pos - 1; i++) player.queue.shift();

  player.skip();
  return sendSuccess(ctxObj, `Skipped to **${target?.title ?? `track #${pos}`}**.`);
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  await handle({ message, isSlash: false }, message.guild.id, args[0] ?? null, client);
}
export async function slashExecute(interaction: any, client: CassieClient) {
  await interaction.deferReply();
  await handle({ interaction, isSlash: true }, interaction.guild.id, interaction.options.getInteger('position', true).toString(), client);
}
