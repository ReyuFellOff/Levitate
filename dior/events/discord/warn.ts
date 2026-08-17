// xoxo/events/discord/warn.ts

export const name = 'warn';
export const once = false;

export function execute(info: string): void {
  console.warn('[WARN]', info);
}
