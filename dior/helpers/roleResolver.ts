// xoxo/helpers/roleResolver.ts
//
// Resolves a guild role from a mention, ID, or text found in its name.

const ROLE_MENTION = /^<@&(\d+)>$/;
const ROLE_ID = /^\d{17,20}$/;

/**
 * Find a role by mention, ID, or text contained in its name.
 *
 * Text matching is intentionally not exact: this lets a role such as
 * "𔓘 hello" be found with either "hello" or "𔓘 hello". When multiple
 * roles contain the search text, the highest role in the hierarchy wins.
 */
export function resolveRole(guild: any, input: string): any | null {
  const value = input.trim();
  if (!value) return null;

  const mention = value.match(ROLE_MENTION);
  const roleId = mention?.[1] ?? (ROLE_ID.test(value) ? value : null);
  if (roleId) return guild.roles?.cache?.get(roleId) ?? null;

  const query = value.toLocaleLowerCase();
  return [...(guild.roles?.cache?.values?.() ?? [])]
    .filter((role: any) => role.name.toLocaleLowerCase().includes(query))
    .sort((a: any, b: any) => b.position - a.position || b.id.localeCompare(a.id))[0] ?? null;
}