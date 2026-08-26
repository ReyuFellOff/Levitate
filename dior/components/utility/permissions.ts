import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import { PERMISSION_NAMES } from '../../config/permissions/discordPermissions.js';

const CV2_FLAGS = {
  flags: MessageFlags.IsComponentsV2,
  allowedMentions: { parse: [] as any[] },
};

function bestAvatar(user: any, member: any): string {
  return member?.avatarURL?.({ size: 4096 })
    ?? user.displayAvatarURL({ size: 4096 });
}

function wrap(container: ContainerBuilder): any {
  return { components: [container], ...CV2_FLAGS };
}

const PERMISSION_GROUPS: Record<string, string[]> = {
  General: [
    'Administrator', 'ViewAuditLog', 'ManageGuild', 'ManageRoles', 'ManageChannels',
    'CreateGuildExpressions', 'CreateEvents', 'ManageEvents', 'ManageGuildExpressions',
    'CreateInstantInvite', 'UseApplicationCommands', 'ViewGuildInsights',
    'ViewCreatorMonetizationAnalytics', 'ManageWebhooks',
  ],
  Members: [
    'KickMembers', 'BanMembers', 'ModerateMembers', 'ChangeNickname', 'ManageNicknames',
    'MoveMembers', 'MuteMembers', 'DeafenMembers',
  ],
  Text: [
    'ViewChannel', 'SendMessages', 'SendMessagesInThreads', 'SendTTSMessages', 'SendPolls',
    'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'MentionEveryone', 'AddReactions',
    'UseExternalEmojis', 'UseExternalStickers', 'ManageMessages', 'ManageThreads',
    'CreatePublicThreads', 'CreatePrivateThreads', 'PinMessages', 'BypassSlowmode',
    'UseExternalApps',
  ],
  Voice: [
    'Connect', 'Speak', 'Stream', 'PrioritySpeaker', 'RequestToSpeak', 'UseVAD',
    'UseSoundboard', 'UseExternalSounds', 'SendVoiceMessages', 'SetVoiceChannelStatus',
    'UseEmbeddedActivities',
  ],
};

function permissionText(member: any, isOwner: boolean): string {
  if (!member) return '> Not a server member.';
  if (isOwner) return '> Owner of the server.';
  if (member.permissions?.has?.('Administrator')) {
    return '> Administrator - This permission contains all the permissions that are known to exist.';
  }

  const granted = new Set(member.permissions?.toArray?.() ?? []);
  const grouped = Object.entries(PERMISSION_GROUPS)
    .map(([group, permissions]) => [
      group,
      permissions
        .filter((permission) => granted.has(permission))
        .map((permission) => PERMISSION_NAMES[permission] ?? permission),
    ] as [string, string[]])
    .filter(([, permissions]) => permissions.length > 0);

  return grouped.length
    ? grouped.map(([group, permissions]) => `${group}\n> ${permissions.join(', ')}`).join('\n')
    : '> None.';
}

export function buildPermissionsPayload(
  user: any,
  member: any,
  isOwner: boolean,
  isRole = false,
): object {
  const title = isRole ? `## <@&${user.id}>'s permissions` : `## <@${user.id}>'s permissions`;
  const body = isRole
    ? permissionText({ permissions: user.permissions }, false)
    : permissionText(member, isOwner);

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(title))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(
          isRole
            ? user.iconURL?.({ size: 4096 }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png'
            : bestAvatar(user, member),
        )),
    );

  return {
    components: [container],
    ...CV2_FLAGS,
  };
}
