// xoxo/helpers/getHostingServiceIP.ts
//
// Fetches the public IP of the hosting machine once at startup and resolves
// it to a display name. Provider resolution:
//  1. If `config.hardcodeHostingService` is non-empty, use that name (and
//     still log the IP if the lookup succeeds — pure cosmetic, matching is
//     skipped entirely).
//  2. Otherwise match the fetched IP against `xoxo/config/hostingServices.ts`.
//  3. Fall back to `config.fallbackHostingService`.

import config from '../config.js';
import { hostingServices } from '../config/hostingServices.js';

let hasLogged          = false;
let cachedProviderName = config.fallbackHostingService;

/** Returns the cached hosting provider name. Always available after getHostingServiceIP() resolves. */
export function getHostingProviderName(): string {
  return cachedProviderName;
}

interface IpInfoResponse {
  ip?:  string;
  org?: string;
}

export async function getHostingServiceIP(): Promise<void> {
  if (hasLogged) return;
  hasLogged = true;

  let ip:  string | null = null;
  let org: string | null = null;

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 5000);
    const response   = await fetch('https://ipinfo.io/json', {
      signal:  controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json() as IpInfoResponse;
      ip  = data.ip  ?? null;
      org = data.org ?? null;
    }
  } catch {
    ip  = null;
    org = null;
  }

  if (ip)  { console.log(`[HOST] Hosting service IP: ${ip}/32`); }
  else     { console.warn('[HOST] Hosting service IP: unknown/32'); }

  if (org) { console.log(`[HOST] Hosting service org: ${org}`); }
  else     { console.warn('[HOST] Hosting service org: unknown'); }

  // If hardcoded, skip IP matching entirely
  if (config.hardcodeHostingService && config.hardcodeHostingService.trim().length > 0) {
    cachedProviderName = config.hardcodeHostingService.trim();
    console.log(`[HOST] Hosting service hardcoded as: ${cachedProviderName}`);
    return;
  }

  if (ip) {
    const matched = hostingServices.find(entry => entry.ip === ip);
    if (matched) {
      cachedProviderName = matched.name;
      console.log(`[HOST] Hosting service detected: ${matched.name}`);
      return;
    }
  }

  // No hardcoded value and no IP match — use the configured fallback
  cachedProviderName = config.fallbackHostingService;
  console.log(`[HOST] No hosting service match — using fallback: "${cachedProviderName}"`);
}
