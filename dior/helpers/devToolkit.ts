import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { promisify } from 'node:util';
import { basename, join, normalize, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vm from 'node:vm';
import { inspect } from 'node:util';
import type { LevitateClient } from '../structures/LevitateClient.js';

const execFile = promisify(execFileCallback);
const WORKSPACE_ROOT = resolve(process.cwd());
const MAX_OUTPUT = 5_500;
const MAX_SOURCE = 8_000;
const EXEC_TIMEOUT = 15_000;
const EVAL_TIMEOUT = 1_000;

export function rawCommandInput(message: any, args: string[]): string {
  if (typeof message.commandRawArgs === 'string') {
    const raw = message.commandRawArgs.trim();
    // messageCreate preserves the raw tail with the active prefix token
    // prepended (for example, "$ 1 + 1"). Remove that one routing token
    // before passing the input to the toolkit command.
    return raw.replace(/^\S+\s+/, '').trim();
  }
  return args.join(' ').trim();
}

export function limitOutput(value: unknown, max = MAX_OUTPUT): string {
  const text = typeof value === 'string'
    ? value
    : inspect(value, { depth: 4, maxArrayLength: 50, breakLength: 100 });
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [output truncated]`;
}

export async function evaluateCode(
  message: any,
  code: string,
  args: string[],
  client: LevitateClient,
): Promise<string> {
  if (!code) return 'Usage: `$eval <javascript>`';

  const logs: string[] = [];
  const sandboxConsole = {
    log: (...values: unknown[]) => logs.push(values.map((v) => inspect(v, { depth: 3 })).join(' ')),
    info: (...values: unknown[]) => logs.push(values.map((v) => inspect(v, { depth: 3 })).join(' ')),
    warn: (...values: unknown[]) => logs.push(`WARN: ${values.map((v) => inspect(v, { depth: 3 })).join(' ')}`),
    error: (...values: unknown[]) => logs.push(`ERROR: ${values.map((v) => inspect(v, { depth: 3 })).join(' ')}`),
  };

  const sandbox = {
    client,
    message,
    guild: message.guild ?? null,
    channel: message.channel ?? null,
    args,
    console: sandboxConsole,
  };

  let result: unknown;
  try {
    // Expression mode makes `$eval 1 + 1` and object literals convenient.
    result = vm.runInNewContext(`(${code})`, sandbox, { timeout: EVAL_TIMEOUT });
  } catch (expressionError) {
    try {
      // Statement mode supports `$eval const x = ...; return x`.
      result = vm.runInNewContext(`(async () => { ${code}\n})()`, sandbox, {
        timeout: EVAL_TIMEOUT,
      });
    } catch (statementError) {
      return `Evaluation error: ${statementError instanceof Error ? statementError.message : String(statementError)}\nExpression attempt: ${expressionError instanceof Error ? expressionError.message : String(expressionError)}`;
    }
  }

  if (result && typeof (result as Promise<unknown>).then === 'function') {
    result = await Promise.race([
      result as Promise<unknown>,
      new Promise((_, reject) => setTimeout(() => reject(new Error('async evaluation timed out')), 5_000)),
    ]);
  }

  const output = [
    logs.length ? `Console:\n${logs.join('\n')}` : '',
    `Result:\n${limitOutput(result)}`,
  ].filter(Boolean).join('\n\n');
  return limitOutput(output);
}

function isBlockedSourcePath(path: string): boolean {
  return path.split(/[\\/]+/).some((part) =>
    part === '.env' ||
    part.startsWith('.env.') ||
    part === 'node_modules' ||
    part === 'dist',
  );
}

export function readSource(requestedPath: string): string {
  const requested = requestedPath.trim();
  if (!requested) return 'Usage: `$source <workspace-relative-file>`';
  if (requested.includes('\0')) return 'Invalid path.';

  const normalized = normalize(requested);
  const fullPath = resolve(WORKSPACE_ROOT, normalized);
  const rel = relative(WORKSPACE_ROOT, fullPath);
  if (!rel || rel.startsWith('..') || rel.includes(`..${normalize('/')}`) || isBlockedSourcePath(rel)) {
    return 'That path is outside the allowed source tree or is blocked.';
  }
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) return `File not found: \`${requested}\``;

  const content = readFileSync(fullPath, 'utf8');
  return `File: \`${rel}\`\n\n${limitOutput(content, MAX_SOURCE)}`;
}

type SafeExec = { command: string; args: string[]; label: string };

function parseSafeExec(input: string): SafeExec | null {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  const [command, ...args] = tokens;
  if (command === 'pwd' && args.length === 0) return { command, args, label: 'pwd' };
  if (command === 'ls' && args.length <= 2 && args.every((arg) => !arg.startsWith('-') && !arg.includes('..'))) {
    return { command, args, label: `ls ${args.join(' ')}`.trim() };
  }
  if (command === 'git' && args.length <= 3 && (
    args[0] === 'status' ||
    args[0] === 'branch' ||
    (args[0] === 'log' && args.slice(1).every((arg) => /^-\w+$/.test(arg))) ||
    (args[0] === 'diff' && args[1] === '--stat')
  )) {
    return { command, args, label: `git ${args.join(' ')}` };
  }
  if (command === 'node' && args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    return { command, args, label: 'node --version' };
  }
  if (command === 'npm' && args.length === 2 && args[0] === 'run' && (
    args[1] === 'build' || args[1] === 'check:command-parity'
  )) {
    return { command, args, label: `npm run ${args[1]}` };
  }
  return null;
}

export async function executeSafeCommand(input: string): Promise<string> {
  const parsed = parseSafeExec(input);
  if (!parsed) {
    return 'Allowed commands: `pwd`, `ls`, `git status`, `git branch`, `git log`, `git diff --stat`, `node --version`, `npm run build`, `npm run check:command-parity`.';
  }

  try {
    const result = await execFile(parsed.command, parsed.args, {
      cwd: WORKSPACE_ROOT,
      timeout: EXEC_TIMEOUT,
      maxBuffer: 512 * 1024,
      shell: false,
    });
    return `${parsed.label}\n\n${limitOutput([result.stdout, result.stderr].filter(Boolean).join('\n')) || '(no output)'}`;
  } catch (error: any) {
    const output = [error?.stdout, error?.stderr, error?.message].filter(Boolean).join('\n');
    return `${parsed.label}\n\n${limitOutput(output)}`;
  }
}

function findCommandFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findCommandFiles(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

export async function reloadPrefixCommand(
  client: LevitateClient,
  requestedName: string,
): Promise<string> {
  const requested = requestedName.toLowerCase().replace(/^\$/, '');
  if (!requested) return 'Usage: `$reload <command>`';

  const commandDir = join(WORKSPACE_ROOT, 'dist', 'dior', 'commands');
  const files = findCommandFiles(commandDir);
  let targetPath: string | null = null;
  let targetName = requested;

  for (const file of files) {
    const raw = await import(pathToFileURL(file).href);
    const mod = raw.default ?? raw;
    const name = mod.options?.name?.toLowerCase();
    const aliases = (mod.options?.aliases ?? []).map((alias: string) => alias.toLowerCase());
    if (name === requested || aliases.includes(requested)) {
      targetPath = file;
      targetName = name;
      break;
    }
  }

  if (!targetPath) return `Command not found: \`${requested}\``;

  const fresh = await import(`${pathToFileURL(targetPath).href}?reload=${Date.now()}`);
  const mod = fresh.default ?? fresh;
  if (typeof mod.prefixExecute !== 'function') return `\`${targetName}\` has no prefix handler.`;

  client.commands.set(targetName, mod);
  for (const [alias, commandName] of client.aliases) {
    if (commandName === targetName) client.aliases.delete(alias);
  }
  for (const alias of mod.options?.aliases ?? []) {
    client.aliases.set(alias.toLowerCase(), targetName);
  }

  return `Reloaded prefix command \`${targetName}\` from \`${relative(WORKSPACE_ROOT, targetPath)}\`.`;
}