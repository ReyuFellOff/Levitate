// xoxo/helpers/twentyFourSeven.ts
// In-memory registry for pending 24/7 rejoin timers (guildId → timeout handle)

const rejoinTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleRejoin(client: any, guildId: string, channelId: string, delayMs: number): void {
  clearRejoin(guildId);
  console.log(`[24-7] Scheduled rejoin to <${channelId}> in ${delayMs / 1000}s for guild ${guildId}`);
  const timer = setTimeout(async () => {
    rejoinTimers.delete(guildId);
    await performRejoin(client, guildId, channelId);
  }, delayMs);
  rejoinTimers.set(guildId, timer);
}

export function clearRejoin(guildId: string): void {
  const timer = rejoinTimers.get(guildId);
  if (timer !== undefined) {
    clearTimeout(timer);
    rejoinTimers.delete(guildId);
    console.log(`[24-7] Cancelled pending rejoin for guild ${guildId}`);
  }
}

async function performRejoin(client: any, guildId: string, channelId: string, retryCount = 0): Promise<void> {
  const guild = client.guilds?.cache?.get(guildId);
  if (!guild) return;

  let channel = guild.channels?.cache?.get(channelId);
  if (!channel) {
    channel = await guild.channels?.fetch(channelId).catch((): null => null);
  }
  if (!channel || !channel.isVoiceBased()) {
    console.warn(`[24-7] Rejoin aborted in ${guild.name}: channel <${channelId}> no longer exists or isn't a voice channel.`);
    return;
  }

  // A voice-connect gateway payload for a channel we lack permission in never
  // errors — Discord silently drops it and the bot just never appears. Check
  // permissions up front so failures are logged instead of hanging forever.
  const me = guild.members?.me ?? (await guild.members?.fetchMe?.().catch((): null => null));
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has('Connect') || !perms?.has('Speak')) {
    console.warn(`[24-7] Rejoin aborted in ${guild.name}: missing Connect/Speak permission in <#${channelId}>.`);
    return;
  }

  const existingPlayer = client.kazagumo?.players?.get(guildId);
  if (existingPlayer) {
    await existingPlayer.destroy().catch((): null => null);
  }

  try {
    await client.kazagumo.createPlayer({
      guildId,
      voiceId: channelId,
      textId: guild.systemChannelId || channelId,
      deaf: true,
    });
    console.log(`[24-7] Rejoined 24/7 channel in ${guild.name}`);
  } catch (err) {
    console.error(`[24-7] Rejoin failed for ${guild.name}: ${(err as Error).message}`);

    // Retry with backoff — Lavalink nodes can take a moment to stabilise.
    // Cap at 3 retries (delays: 30s → 60s → 120s).
    const MAX_RETRIES = 3;
    if (retryCount < MAX_RETRIES) {
      const retryDelay = 30_000 * Math.pow(2, retryCount); // 30s, 60s, 120s
      console.log(`[24-7] Scheduling retry ${retryCount + 1}/${MAX_RETRIES} for ${guild.name} in ${retryDelay / 1000}s`);
      const timer = setTimeout(async () => {
        rejoinTimers.delete(guildId);
        await performRejoin(client, guildId, channelId, retryCount + 1);
      }, retryDelay);
      rejoinTimers.set(guildId, timer);
    } else {
      console.warn(`[24-7] Giving up on rejoining ${guild.name} after ${MAX_RETRIES} retries.`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot-time restore
// ─────────────────────────────────────────────────────────────────────────────
//
// getAllEnabled24Seven() previously had no caller anywhere in the codebase —
// on every restart/deploy, every guild's 24/7 connection was silently
// forgotten until someone ran `24/7 enable` again. This restores them once
// the first Lavalink node comes online (kazagumo.createPlayer needs a
// connected node to work), and is guarded to run exactly once per process.

let bootReconnectStarted  = false;
let bootReconnectComplete = false;

export async function reconnectAllOnBoot(client: any): Promise<void> {
  if (bootReconnectStarted) return;
  bootReconnectStarted = true;

  await _doReconnectAll(client, 'boot');
  bootReconnectComplete = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mid-session node-recovery restore
// ─────────────────────────────────────────────────────────────────────────────
//
// When the active Lavalink node goes down mid-session, Shoukaku destroys all
// players but never fires a Discord voiceStateUpdate. The bot stays in VC
// from Discord's perspective but loses its Lavalink player. Once the node
// manager connects a new node, this is called to restore every 24/7
// connection that this cluster owns — without the once-per-process guard.
//
// Skipped on the very first node-ready event because reconnectAllOnBoot()
// runs at the same time and would race to create the same players.

export async function reconnectAfterNodeRecover(client: any): Promise<void> {
  if (!bootReconnectComplete) return; // boot pass hasn't finished yet — skip
  await _doReconnectAll(client, 'node-recover');
}

async function _doReconnectAll(client: any, reason: string): Promise<void> {
  if (!client.db?.getAllEnabled24Seven) return;

  let entries: Array<{ guildId: string; channelId: string }> = [];
  try {
    entries = await client.db.getAllEnabled24Seven();
  } catch (err) {
    console.error(`[24-7] Failed to load enabled 24/7 guilds (${reason}): ${(err as Error).message}`);
    return;
  }

  if (entries.length === 0) return;
  console.log(`[24-7] [${reason}] Restoring up to ${entries.length} 24/7 connection(s)...`);

  let restored = 0;
  for (const { guildId, channelId } of entries) {
    // Only reconnect guilds this cluster actually owns.
    const guild = client.guilds?.cache?.get(guildId);
    if (!guild) continue;

    // Already has a live player — leave it alone.
    if (client.kazagumo?.players?.get(guildId)) continue;

    // Clear any pending rejoin timer so there's no race with this reconnect.
    clearRejoin(guildId);

    let channel = guild.channels?.cache?.get(channelId);
    if (!channel) {
      channel = await guild.channels.fetch(channelId).catch((): null => null);
    }
    if (!channel || !channel.isVoiceBased?.()) {
      console.warn(`[24-7] [${reason}] Skipping ${guild.name}: saved channel <${channelId}> no longer exists.`);
      continue;
    }

    const me = guild.members?.me ?? (await guild.members?.fetchMe?.().catch((): null => null));
    const perms = me ? channel.permissionsFor(me) : null;
    if (!perms?.has('Connect') || !perms?.has('Speak')) {
      console.warn(`[24-7] [${reason}] Skipping ${guild.name}: missing Connect/Speak permission in <#${channelId}>.`);
      continue;
    }

    try {
      await client.kazagumo.createPlayer({
        guildId,
        voiceId: channelId,
        textId: guild.systemChannelId || channelId,
        deaf: true,
      });
      restored++;
      console.log(`[24-7] [${reason}] Restored connection in ${guild.name} (#${channel.name})`);
    } catch (err) {
      console.error(`[24-7] [${reason}] Failed to restore connection in ${guild.name}: ${(err as Error).message}`);
    }

    // Stagger to avoid a burst of simultaneous voice-gateway handshakes.
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  console.log(`[24-7] [${reason}] Reconnect pass complete: ${restored}/${entries.length} restored.`);
}
