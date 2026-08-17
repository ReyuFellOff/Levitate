// xoxo/components/features/customrole.ts
//
// Static Components V2 views for custom-role command lists.

import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import { emojis } from '../../emojis.js';
import { Database } from '../../database/database.js';

const NO_MENTIONS = { parse: [] as any[] };

function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: NO_MENTIONS,
  };
}

export function buildCustomRoleListPayload(
  docs: Array<{ keyword: string; role_ids: string[] }>,
  guild: any,
  accessRole: any,
): any {
  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${emojis.blackCards} Custom Roles\n` +
        `-# ${docs.length}/${Database.CUSTOM_ROLE_MAX_PER_GUILD} keywords`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  const lines = docs.map((doc, index) => {
    const roleList = doc.role_ids
      .map((id: string) => {
        const role = guild.roles.cache.get(id);
        return role ? `<@&${role.id}>` : `~~${id}~~`;
      })
      .join(', ');
    return `${emojis.whiteArrow} **${index + 1}.** \`${doc.keyword}\`: ${roleList}`;
  });

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      lines.length ? lines.join('\n') : `${emojis.info} No custom role keywords yet.`,
    ),
  );

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Access role:** ${accessRole ? `<@&${accessRole.id}>` : 'not configured'}\n` +
        '**Usage:**\n' +
        '`customrole create <keyword> <@role(s)>`\n' +
        '`customrole delete <keyword>`',
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Use `customrole info <keyword>` to see linked roles. Access is server-wide.',
      ),
    );

  return wrap(container);
}