import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { config } from '../../config.js';

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

function plural(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export function formatAccountAge(createdAt: number, now = new Date()): string {
  const created = new Date(createdAt);
  if (!Number.isFinite(createdAt) || created.getTime() > now.getTime()) return '0 seconds';

  let cursor = created;
  let years = 0;
  while (addCalendarMonths(cursor, 12).getTime() <= now.getTime()) {
    cursor = addCalendarMonths(cursor, 12);
    years++;
  }

  let months = 0;
  while (addCalendarMonths(cursor, 1).getTime() <= now.getTime()) {
    cursor = addCalendarMonths(cursor, 1);
    months++;
  }

  let remainingSeconds = Math.floor((now.getTime() - cursor.getTime()) / 1000);
  const weeks = Math.floor(remainingSeconds / 604800);
  remainingSeconds %= 604800;
  const days = Math.floor(remainingSeconds / 86400);
  remainingSeconds %= 86400;
  const hours = Math.floor(remainingSeconds / 3600);
  remainingSeconds %= 3600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  const unitParts: [number, string][] = [
    [years, 'year'],
    [months, 'month'],
    [weeks, 'week'],
    [days, 'day'],
    [hours, 'hour'],
    [minutes, 'minute'],
    [seconds, 'second'],
  ];
  const parts = unitParts
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `**${value}** ${plural(value, unit).slice(String(value).length + 1)}`);

  return parts.length ? parts.join(', ').replace(/, ([^,]+)$/, ', and $1') : '**0** seconds';
}

export function buildAccountAgePayload(user: any, member: any): object {
  const title = `## <@${user.id}> (\`${user.id}\`)`;
  const body = `This account has been alive for ${formatAccountAge(user.createdTimestamp)}.`;

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(title))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(bestAvatar(user, member))),
    );

  return wrap(container);
}
