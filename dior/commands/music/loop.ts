// xoxo/commands/music/loop.ts
// Loop modes: none → track → queue → none
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';

export const options = {
  name: 'loop',
  aliases: ['repeat', 'l'] as string[],
  description: 'Toggle loop mode (none → track → queue → none).',
  usage: 'loop [none|track|queue]',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 2,
};

const LOOP_CYCLE: Record<string, string> = { none: 'track', track: 'queue', queue: 'none' };

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, mode: string | null, client: CassieClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');

  let newMode: string;
  if (mode && ['none', 'track', 'queue'].includes(mode)) {
    newMode = mode;
  } else {
    newMode = LOOP_CYCLE[player.loop ?? 'none'] ?? 'track';
  }

  player.setLoop(newMode);
  await updateNowPlayingMessage(client as any, player).catch((): null => null);

  const label = newMode === 'none' ? 'disabled' : newMode === 'track' ? '🔂 track' : '🔁 queue';
  return sendSuccess(ctxObj, `Loop mode set to **${label}**.`);
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  await handle({ message, isSlash: false }, message.guild.id, args[0]?.toLowerCase() ?? null, client);
}
export async function slashExecute(interaction: any, client: CassieClient) {
  await interaction.deferReply();
  await handle({ interaction, isSlash: true }, interaction.guild.id, interaction.options.getString('mode', false), client);
}
