// xoxo/commands/developer/node-status.ts
// Developer-only: shows which Lavalink node is currently active and lists all
// configured nodes in priority order (best → fallback).

import { sendError, sendInfo } from '../../components/statusMessages.js';
import { getActiveNodeName, getPriorityOrder } from '../../helpers/nodeManager.js';

export const options = {
  name: 'node-status',
  aliases: ['nodestatus', 'ns'] as string[],
  description: 'Show which Lavalink node is connected and list all configured nodes in priority order.',
  usage: 'node-status',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

/** Oxford-comma-separated list from an array of strings. */
function oxfordList(names: string[]): string {
  if (names.length === 0) return 'none';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
}

export async function prefixExecute(message: any, _args: string[], client: any) {
  const ctx = { message };

  const shoukaku = client?.kazagumo?.shoukaku;
  if (!shoukaku) return sendError(ctx, 'Kazagumo/Shoukaku is not initialised.');

  const priorityOrder = getPriorityOrder();
  if (priorityOrder.length === 0) return sendError(ctx, 'No Lavalink nodes are configured.');

  const activeManagerName = getActiveNodeName();
  const liveNodes: Map<string, any> = shoukaku.nodes;

  // A node whose Shoukaku state is 1 is fully connected.
  const connectedNode = [...liveNodes.values()].find((n: any) => n.state === 1) ?? null;

  if (connectedNode) {
    const others = priorityOrder.filter(n => n !== connectedNode.name);
    // If the manager is targeting a different node than the one that's live,
    // note it (e.g. manager just queued up a failover).
    const managerNote =
      activeManagerName && activeManagerName !== connectedNode.name
        ? ` *(manager targeting: **${activeManagerName}**)*`
        : '';
    return sendInfo(
      ctx,
      `**${connectedNode.name}** is connected.${managerNote} Other nodes: ${oxfordList(others)}`,
    );
  }

  const managerNote = activeManagerName
    ? ` Manager is currently targeting: **${activeManagerName}**.`
    : '';
  return sendError(
    ctx,
    `No node is connected.${managerNote} Configured nodes (priority order): ${oxfordList(priorityOrder)}`,
  );
}
