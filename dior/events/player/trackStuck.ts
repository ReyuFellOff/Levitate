// xoxo/events/player/trackStuck.ts
// Kazagumo event: 'playerStuck' — fires when Lavalink stops receiving audio frames
// Args: (player: KazagumoPlayer, track: KazagumoTrack, thresholdMs: number)
import {
  buildTrackStuckRetryingPayload,
  buildTrackRecoveredPayload,
  buildTrackUnrecoverablePayload,
} from '../../components/music/playerAlerts.js';
import { extractThumbnail } from '../../utils/formatting.js';
import { pickRetrySource, resolveAndInjectAlternate } from '../../helpers/playerRetry.js';

export const name = 'playerStuck';
export const type = 'player';

export async function execute(client: any, player: any, track: any, _thresholdMs: number): Promise<void> {
  const guild = client.guilds.cache.get(player.guildId);
  if (!guild) return;

  // Skip retry for already-retried tracks
  if ((track as any)._autoRetried) {
    console.warn(`[PLAYER] Retried track got stuck again in ${guild.name} — skipping`);
    player.skip();
    return;
  }

  console.warn(`[PLAYER] ⚠️ Track stuck in ${guild.name}: ${track.title}`);

  const channel = client.channels.cache.get(player.textId);

  const trackInfo = {
    title:      track.title,
    author:     track.author,
    url:        track.uri,
    thumbnail:  track.thumbnail ?? extractThumbnail(track) ?? undefined,
    sourceName: track.sourceName,
  };

  const retrySource    = pickRetrySource(track.sourceName);
  const retryingPayload = buildTrackStuckRetryingPayload(trackInfo, retrySource);

  let alertMessage: any = null;
  if (channel) {
    alertMessage = await (channel as any).send(retryingPayload).catch((): null => null);
  }

  const sendAlertPromise  = Promise.resolve(alertMessage);
  const retryPromise      = resolveAndInjectAlternate(client, player, track, retrySource);

  const [, retryTrack] = await Promise.all([sendAlertPromise, retryPromise]);

  if (!retryTrack) {
    const failPayload = buildTrackUnrecoverablePayload(trackInfo);
    if (alertMessage?.editable) {
      await alertMessage.edit(failPayload).catch((): null => null);
    } else if (channel) {
      await (channel as any).send(failPayload).catch((): null => null);
    }
    player.skip();
    return;
  }

  const successPayload = buildTrackRecoveredPayload(
    { ...trackInfo, thumbnail: retryTrack.thumbnail ?? trackInfo.thumbnail, url: retryTrack.uri ?? trackInfo.url },
    retrySource,
  );

  if (alertMessage?.editable) {
    await alertMessage.edit(successPayload).catch((): null => null);
  } else if (channel) {
    await (channel as any).send(successPayload).catch((): null => null);
  }
}
