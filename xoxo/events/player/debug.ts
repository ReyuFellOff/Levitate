// xoxo/events/player/debug.ts
// Shoukaku emits 'debug' on the Shoukaku instance (type: 'node'), not on Kazagumo.
// Args: (nodeName: string, message: string)
// Only logs in development mode to avoid noise in production.

export const name = 'debug';
export const type = 'node';

export async function execute(_client: any, nodeName: string, message: string): Promise<void> {
  if (process.env['NODE_ENV'] === 'development') {
    console.debug(`[SHOUKAKU] [${nodeName}] ${message}`);
  }
}
