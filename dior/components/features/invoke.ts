import { config } from '../../config.js';
// xoxo/components/features/invoke.ts
//
// Static Components V2 views for personal invoke responses.

import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';

const NO_MENTIONS = { parse: [] as any[] };
export const MAX_INVOKE_MESSAGES = 2_000;

const PLACEHOLDERS =
  '`{user}` name · `{mention}` mention · `{id}` ID · `{reason}` reason\n' +
  '`{invoker}` moderator · `{invokerMention}` moderator mention · `{command}` command';

function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: NO_MENTIONS,
  };
}

function preview(message: string): string {
  // Keep configured markdown from changing the layout of the management panel.
  return `\`\`\`\n${message}\n\`\`\``;
}

export function buildInvokeListPayload(
  docs: Array<{ command: string; message: string }>,
  _username: string,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${docs.length} response${docs.length === 1 ? '' : 's'}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (docs.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('You have no invoke responses yet.'),
    );
  } else {
    for (const doc of docs) {
      container
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`> \`${doc.command}\`:`),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(preview(doc.message)),
        );
    }
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '**Usage:**\n' +
        '`invoke set <command> <message>`\n' +
        '`invoke remove <command>`',
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Supported placeholders: ${PLACEHOLDERS}`),
    );

  return wrap(container);
}

export function buildInvokeSavedPayload(
  command: string,
  message: string,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Invoke response saved',
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `> \`${command}\`:\n${preview(message)}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Use `invoke list` to view your responses.',
      ),
    );

  return wrap(container);
}