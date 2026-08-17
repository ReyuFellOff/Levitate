// xoxo/helpers/panelGuard.ts
//
// Shared "author-only" guard for interactive panels (buttons/selects driven
// by a message component collector). Many panels in this bot are
// configuration surfaces (confirm dialogs, builders, pickers) that are only
// meant to be operated by the person who ran the command. Anyone else who
// clicks a component on that panel should be told the panel isn't theirs
// instead of the click silently being swallowed by the collector filter.
//
// Usage inside a `createMessageComponentCollector` / `awaitMessageComponent`
// filter:
//
//   filter: (i: any) => authorOnlyFilter(i, authorId, (id) => id.endsWith(`:${token}`)),
//
// The optional `matches` predicate lets a collector still ignore
// customIds it doesn't own (returns false, no message sent) while still
// warning off other users for customIds it *does* own.

import { MessageFlags } from 'discord.js';

const NOT_FOR_YOU = 'This panel is not for you.';

/**
 * Returns true only when the interaction belongs to `authorId` AND (if given)
 * matches the `matches` predicate. When the customId matches but the user is
 * not the author, replies ephemerally so the clicker gets clear feedback
 * instead of a dead button.
 */
export function authorOnlyFilter(
  interaction: any,
  authorId: string,
  matches?: (customId: string) => boolean,
  message = NOT_FOR_YOU,
): boolean {
  if (matches && !matches(interaction.customId)) return false;

  if (interaction.user?.id !== authorId) {
    interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch((): null => null);
    return false;
  }

  return true;
}
