import { config } from '../config.js';
import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../structures/LevitateClient.js';
import { sendError } from '../components/statusMessages.js';
import { resolveUser } from './userResolver.js';
import { emojis } from '../emojis.js';

export type RoleplayAction = {
  name: string;
  api: string;
  pair: boolean;
  phrase: string;
};

const NEKOS = new Set(
  'kick kiss bite cuddle hug pat pout poke slap smile tickle punch sleep angry blush cry dance nom run thumbsup wave wink yawn'.split(' '),
);
const OTAKU = new Set(
  'kiss bite cuddle hug pat pout poke slap smile tickle punch sleep angry blush cry dance celebrate shy sigh sing slowclap sneeze sorry stop surprised sweat tired woah yay airkiss angrystare brofist cheers cool drool evillaugh headbang huh lick love mad nervous nosebleed peek pinch nyah roll sad scared shout nom run thumbsup wave wink yawn'.split(' '),
);
const PURR = new Set(
  'angry bite blush comfy cry cuddle dance hug kiss lick pat poke pout slap smile tickle'.split(' '),
);

type GifProvider = 'nekos' | 'otaku' | 'purr';
const API_ORDER: GifProvider[] = ['nekos', 'otaku', 'purr'];

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function providerUrl(provider: GifProvider, api: string): string {
  if (provider === 'nekos') return `https://nekos.best/api/v2/${api}?amount=1`;
  if (provider === 'otaku') return `https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(api)}&format=gif`;
  return `https://api.purrbot.site/v2/img/sfw/${api}/gif`;
}

async function getGif(api: string): Promise<string | null> {
  const providers = shuffled(
    API_ORDER.filter((provider) =>
      provider === 'nekos' ? NEKOS.has(api) : provider === 'otaku' ? OTAKU.has(api) : PURR.has(api),
    ),
  );

  for (const provider of providers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(providerUrl(provider, api), {
        headers: { 'User-Agent': 'Levitate Discord Bot/1.0' },
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const body: any = await response.json();
      const url = provider === 'nekos' ? body?.results?.[0]?.url : provider === 'otaku' ? body?.url : body?.link;
      if (typeof url === 'string' && url.startsWith('http')) return url;
    } catch {
      // Try the next configured provider.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Pick a non-bot guild member, excluding the users already participating.
 * The guide requires random targets for paired actions when no target is
 * supplied, so bots and duplicate participants are never eligible.
 */
async function randomMember(guild: any, exclude: string[]): Promise<any | null> {
  const members = await guild.members.fetch({ limit: 1000 }).catch((): null => null);
  if (!members) return null;
  const eligible = [...members.values()].filter((member: any) =>
    !member.user.bot && !exclude.includes(member.user.id),
  );
  return eligible.length ? eligible[Math.floor(Math.random() * eligible.length)].user : null;
}

async function participants(
  client: LevitateClient,
  guild: any,
  author: any,
  args: string[],
  pair: boolean,
): Promise<{ user1: any; user2: any | null } | { error: string }> {
  if (!pair) {
    if (!args[0]) return { user1: author, user2: null };
    const user = await resolveUser(client, guild, args[0]);
    return user ? { user1: user, user2: null } : { error: `Could not find a user matching \`${args[0]}\`.` };
  }

  if (!guild) return { error: 'This roleplay command needs a server when no target is provided.' };
  if (!args[0]) {
    const user2 = await randomMember(guild, [author.id]);
    return user2 ? { user1: author, user2 } : { error: 'There are no other members available to target.' };
  }

  const first = await resolveUser(client, guild, args[0]);
  if (!first) return { error: `Could not find a user matching \`${args[0]}\`.` };
  if (!args[1]) return { user1: author, user2: first };

  const second = await resolveUser(client, guild, args[1]);
  return second ? { user1: first, user2: second } : { error: `Could not find a user matching \`${args[1]}\`.` };
}

function payload(action: RoleplayAction, user1: any, user2: any | null, gif: string): any {
  const content = user2
    ? `### ${emojis.blackStar} <@${user1.id}> ${action.phrase} <@${user2.id}>`
    : `### ${emojis.blackStar} <@${user1.id}> ${action.phrase}`;
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(gif)),
    );
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export async function runRoleplay(
  action: RoleplayAction,
  context: { message?: any; interaction?: any },
  client: LevitateClient,
  args: string[] = [],
): Promise<any> {
  const guild = context.message?.guild ?? context.interaction?.guild ?? null;
  const author = context.message?.author ?? context.interaction?.user;
  const result = await participants(client, guild, author, args, action.pair);
  if ('error' in result) return sendError(context, result.error);

  const gif = await getGif(action.api);
  if (!gif) return sendError(context, `No GIF provider is available for **${action.name}** right now.`);

  const output = payload(action, result.user1, result.user2, gif);
  if (context.interaction) return context.interaction.editReply(output);
  return context.message.channel.send(output);
}

const pairPhrases: Record<string, string> = {
  rkick: 'kicked',
  kiss: 'kissed',
  cuddle: 'cuddled',
  hug: 'hugged',
  pat: 'patted',
  slap: 'slapped',
  punch: 'punched',
};

const singlePhrases: Record<string, string> = {
  bite: 'bit',
  poke: 'poked',
  tickle: 'tickled',
  smile: 'smiled',
  pout: 'pouted',
  sleep: 'fell asleep',
  angry: 'is angry',
  blush: 'blushed',
  cry: 'cried',
  dance: 'danced',
  comfy: 'got comfy',
  celebrate: 'celebrated',
  shy: 'is shy',
  sigh: 'sighed',
  sing: 'sang',
  slowclap: 'slow-clapped',
  sneeze: 'sneezed',
  sorry: 'said sorry',
  rstop: 'said stop',
  surprised: 'was surprised',
  sweat: 'started sweating',
  tired: 'is tired',
  woah: 'said woah',
  yay: 'said yay',
  airkiss: 'blew a kiss',
  angrystare: 'angrily stared',
  brofist: 'brofisted',
  cheers: 'cheered',
  cool: 'acted cool',
  drool: 'drooled',
  evilaugh: 'evil-laughed',
  headband: 'headbanged',
  huh: 'said huh',
  lick: 'licked',
  love: 'showed love',
  mad: 'is mad',
  nervous: 'is nervous',
  nosebleed: 'got a nosebleed',
  peek: 'peeked',
  pinch: 'pinched',
  nyah: 'said nyah',
  roll: 'rolled',
  sad: 'is sad',
  scared: 'got scared',
  shout: 'shouted',
  nom: 'went nom',
  run: 'ran',
  thumbsup: 'gave a thumbs up',
  wave: 'waved',
  wink: 'winked',
  yawn: 'yawned',
};

const apiNames: Record<string, string> = {
  rkick: 'kick',
  rstop: 'stop',
  evilaugh: 'evillaugh',
  headband: 'headbang',
};

export const roleplayActions: RoleplayAction[] = [
  ...Object.keys(pairPhrases).map((name) => ({
    name,
    api: apiNames[name] ?? name,
    pair: true,
    phrase: pairPhrases[name],
  })),
  ...Object.keys(singlePhrases).map((name) => ({
    name,
    api: apiNames[name] ?? name,
    pair: false,
    phrase: singlePhrases[name],
  })),
];