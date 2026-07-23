// xoxo/events/node/nodeConnect.ts
// Shoukaku event: 'ready' — fires when a node connects or resumes
// Args: (name: string, resumed: boolean)

export const name = 'ready';
export const type = 'node';

export const execute = (client: any, name: string, resumed: boolean): void => {
  if (resumed) {
    console.log(`[NODE] 🔄 Lavalink node "${name}" resumed session.`);
  } else {
    console.log(`[NODE] ✅ Lavalink node "${name}" connected!`);
  }
};
