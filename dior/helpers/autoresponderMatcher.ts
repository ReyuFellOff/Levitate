// xoxo/helpers/autoresponderMatcher.ts
//
// Trigger-matching logic for the autoresponder system.
//
// "exact"    — the trimmed message content must equal the trigger exactly
//              (case-insensitive).
// "anywhere" — the trigger must appear as a whole word/phrase among the
//              message's whitespace-separated tokens (case-insensitive).
//              This is NOT a substring match: punctuation attached to a
//              token breaks the match, and partial words don't match.
//
//              trigger "cat":
//                "this is a cat"  → matches (token "cat")
//                "cat"            → matches
//                "what is a cat"  → matches
//                "catsy"          → no match (token "catsy" != "cat")
//                "cat?"           → no match (token "cat?" != "cat")
//                "cats"           → no match (token "cats" != "cat")

import type { AutoresponderMatchType } from '../database/database.js';

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function messageMatchesTrigger(
  messageContent: string,
  trigger: string,
  matchType: AutoresponderMatchType,
): boolean {
  const trimmedContent = messageContent.trim();
  if (!trimmedContent || !trigger) return false;

  if (matchType === 'exact') {
    return trimmedContent.toLowerCase() === trigger.trim().toLowerCase();
  }

  // "anywhere" — whole-word/phrase match against message tokens.
  const triggerTokens = tokenize(trigger).map((t) => t.toLowerCase());
  if (triggerTokens.length === 0) return false;

  const msgTokens = tokenize(trimmedContent).map((t) => t.toLowerCase());
  if (msgTokens.length < triggerTokens.length) return false;

  for (let i = 0; i <= msgTokens.length - triggerTokens.length; i++) {
    let allMatch = true;
    for (let j = 0; j < triggerTokens.length; j++) {
      if (msgTokens[i + j] !== triggerTokens[j]) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }
  return false;
}
