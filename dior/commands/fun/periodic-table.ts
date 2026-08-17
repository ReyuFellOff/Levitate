// xoxo/commands/fun/periodic-table.ts
//
// $periodic-table <element name, symbol, or atomic number>

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendLoading } from '../../components/statusMessages.js';
import {
  buildPeriodicTablePayload,
  fetchPeriodicTableElement,
} from '../../components/fun/periodicTable.js';

export const options = {
  name: 'periodic-table',
  aliases: ['element', 'ptable', 'periodictable'] as string[],
  description: 'Look up an element from the periodic table.',
  usage: 'periodic-table <element name|symbol|atomic number>',
  category: 'socials',
  owner: false,
  cooldown: 5,
};

export async function prefixExecute(
  message: any,
  args: string[],
  _client: LevitateClient,
): Promise<any> {
  const query = args.join(' ').trim();
  if (!query) {
    return sendError({ message }, 'Please provide an element name, symbol, or atomic number. Usage: `$periodic-table <element>`');
  }

  const loading: any = await sendLoading({ message }, `Looking up **${query}**…`);
  const result = await fetchPeriodicTableElement(query);
  await loading?.delete().catch((): null => null);

  if (!result.element) {
    return sendError({ message }, result.error ?? 'I could not find that element.');
  }

  return message.channel.send(buildPeriodicTablePayload(result.element));
}