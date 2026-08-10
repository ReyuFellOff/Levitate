// xoxo/events/player/trackError.ts
// Kazagumo event: 'playerException' — fires when Lavalink raises a playback exception
// Args: (player: KazagumoPlayer, track: KazagumoTrack, error: { message: string; severity: string })
import { buildTrackErrorPayload } from '../../components/music/playerAlerts.js';
import { extractThumbnail } from '../../utils/formatting.js';

export const name = 'playerException';
export const type = 'player';

export async function execute(client: any, player: any, track: any, error: any): Promise<void> {
  const guild = client.guilds.cache.get(player.guildId);
  if (!guild) return;

  // Skip retry if this is already a retried track (avoid infinite loop)
  if ((track as any)._autoRetried) {
    console.warn(`[PLAYER] Retried track also errored in ${guild.name} — skipping`);
    player.skip();
    return;
  }

  const errorMessage = error?.message ?? 'Unknown error';
  console.error(`[PLAYER] ❌ Track exception in ${guild.name}: ${errorMessage}`);

  const channel = client.channels.cache.get(player.textId);

  const trackInfo = {
    title:      track.title,
    author:     track.author,
    url:        track.uri,
    thumbnail:  track.thumbnail ?? extractThumbnail(track) ?? undefined,
    sourceName: track.sourceName,
  };

  const payload = buildTrackErrorPayload(trackInfo, errorMessage);

  if (channel) {
    await (channel as any).send(payload).catch((): null => null);
  }

  player.skip();
}
