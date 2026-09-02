import type { CassieClient } from '../structures/CassieClient.js';
import type { CommandCooldown } from '../handlers/commandLoader.js';

export function getCommandCooldown(
  command: any,
  subcommand?: string,
): number {
  const configured = command.options?.cooldown as CommandCooldown | undefined;
  if (typeof configured === 'number') return Math.max(0, configured);
  if (!configured) return 0;
  if (subcommand && configured.subcommands?.[subcommand] !== undefined) {
    return Math.max(0, configured.subcommands[subcommand]);
  }
  return Math.max(0, configured.default ?? 0);
}

export function getPrefixSubcommand(args: string[]): string | undefined {
  const first = args[0]?.toLowerCase();
  if (first === 'all' && args[1]?.toLowerCase() === 'remove') return 'all-remove';
  return first;
}

/** Returns remaining seconds, or zero when the command is allowed and recorded. */
export function consumeCommandCooldown(
  client: CassieClient,
  command: any,
  userId: string,
  subcommand?: string,
): number {
  const seconds = getCommandCooldown(command, subcommand);
  if (seconds <= 0) return 0;

  const key = `${userId}:${command.options?.name ?? 'unknown'}:${subcommand ?? ''}`;
  const now = Date.now();
  const expiresAt = client.cooldowns.get(key) ?? 0;
  if (expiresAt > now) return Math.ceil((expiresAt - now) / 1000);

  client.cooldowns.set(key, now + seconds * 1000);
  return 0;
}
