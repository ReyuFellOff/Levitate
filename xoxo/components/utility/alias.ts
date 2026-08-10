// xoxo/components/utility/alias.ts
//
// Static Components V2 view for personal command aliases.
// Creation and deletion are handled directly by the `alias` command.

import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import type { UserCommandAliasDoc } from '../../database/database.js';
import { emojis } from '../../emojis.js';

const NO_MENTIONS = { parse: [] as any[] };
export const MAX_PER_USER = 15;

function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: NO_MENTIONS,
  };
}

export function buildAliasListPayload(
  docs: UserCommandAliasDoc[],
  username: string,
): any {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${emojis.blackCards} ${username}'s Command Aliases\n` +
        `-# ${docs.length}/${MAX_PER_USER} aliases`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (docs.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emojis.info} You have no aliases yet.`),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        docs
          .map((doc) => `${emojis.whiteArrow} \`${doc.alias}\` → \`${doc.command}\``)
          .join('\n'),
      ),
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '**Usage:**\n' +
        '`alias create <name> <command name>`\n' +
        '`alias delete <name>`',
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Aliases are private to a user and global across all servers. You can have max 15 aliases.',
      ),
    );

  return wrap(container);
}

export async function runAliasList(
  message: any,
  client: LevitateClient,
): Promise<void> {
  const docs = await client.db!.getUserAliases(message.author.id);
  await message.channel.send(buildAliasListPayload(docs, message.author.username));
}