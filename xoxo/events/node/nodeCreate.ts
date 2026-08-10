// xoxo/events/node/nodeCreate.ts
// Shoukaku has no 'nodeCreate' event — this event will never fire.
// Kept for structural consistency; connect/resume logic lives in nodeConnect.ts (ready event).

export const name = 'nodeCreate';
export const type = 'node';

export const execute = (_client: any, name: string): void => {
  console.log(`[NODE] 🆕 Lavalink node "${name}" created.`);
};
