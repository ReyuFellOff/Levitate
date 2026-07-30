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

async function performRejoin(client: any, guildId: string, channelId: string): Promise<void> {
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

let bootReconnectStarted = false;

export async function reconnectAllOnBoot(client: any): Promise<void> {
  if (bootReconnectStarted) return;
  bootReconnectStarted = true;

  if (!client.db?.getAllEnabled24Seven) return;

  let entries: Array<{ guildId: string; channelId: string }> = [];
  try {
    entries = await client.db.getAllEnabled24Seven();
  } catch (err) {
    console.error(`[24-7] Failed to load enabled 24/7 guilds: ${(err as Error).message}`);
    return;
  }

  if (entries.length === 0) return;
  console.log(`[24-7] Restoring up to ${entries.length} 24/7 connection(s) on boot...`);

  let restored = 0;
  for (const { guildId, channelId } of entries) {
    // client.guilds.cache is the ownership boundary in a sharded/clustered
    // setup — only reconnect guilds this cluster actually owns. Never fall
    // back to a REST fetch here, that would ignore cluster ownership and
    // risk two clusters fighting over the same guild's voice connection.
    const guild = client.guilds?.cache?.get(guildId);
    if (!guild) continue;

    // Already connected (e.g. a mid-session Lavalink reconnect fired this
    // again somehow) — leave the live player alone.
    if (client.kazagumo?.players?.get(guildId)) continue;

    let channel = guild.channels?.cache?.get(channelId);
    if (!channel) {
      channel = await guild.channels.fetch(channelId).catch((): null => null);
    }
    if (!channel || !channel.isVoiceBased?.()) {
      console.warn(`[24-7] Skipping ${guild.name}: saved channel <${channelId}> no longer exists.`);
      continue;
    }

    const me = guild.members?.me ?? (await guild.members?.fetchMe?.().catch((): null => null));
    const perms = me ? channel.permissionsFor(me) : null;
    if (!perms?.has('Connect') || !perms?.has('Speak')) {
      console.warn(`[24-7] Skipping ${guild.name}: missing Connect/Speak permission in <#${channelId}>.`);
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
      console.log(`[24-7] Restored connection in ${guild.name} (#${channel.name})`);
    } catch (err) {
      console.error(`[24-7] Failed to restore connection in ${guild.name}: ${(err as Error).message}`);
    }

    // Stagger so a bot in many 24/7 guilds doesn't fire a burst of
    // simultaneous voice-gateway handshakes on boot.
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  console.log(`[24-7] Boot reconnect pass complete: ${restored}/${entries.length} restored.`);
}
