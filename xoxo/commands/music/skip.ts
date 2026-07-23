// xoxo/commands/music/skip.ts
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';

export const options = {
  name: 'skip',
  aliases: ['s', 'next'] as string[],
  description: 'Skip the currently playing track.',
  usage: 'skip',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 2,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, client: LevitateClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');

  const track = player.queue.current;
  player.skip();
  return sendSuccess(ctxObj, `Skipped **${track.title}**.`);
}

export async function prefixExecute(message: any, _args: string[], client: LevitateClient) {
  await handle({ message, isSlash: false }, message.guild.id, client);
}
export async function slashExecute(interaction: any, client: LevitateClient) {
  await interaction.deferReply();
  await handle({ interaction, isSlash: true }, interaction.guild.id, client);
}
