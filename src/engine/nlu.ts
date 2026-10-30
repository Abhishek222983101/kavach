// Deterministic message understanding (keyword + regex). No LLM. Hinglish-aware.
import type { Lang } from './types';

export type Intent = 'wismo' | 'refund' | 'return' | 'address' | 'cancel' | 'unknown';
export interface Parsed {
  lang: Lang;
  intent: Intent;
  orderId: number | null;
  amount: number | null;
  reason: 'damaged' | 'wrong_item' | 'other';
  claimedWindowDays: number | null;   // e.g. "30 din ka return"  (customer claim, untrusted)
  authorityClaim: boolean;            // e.g. "owner ne approve kiya hai" (customer claim, untrusted)
  newAddress: string | null;
  photoMentioned: boolean;
}

const money = (s: string) => parseInt(s.replace(/,/g, ''), 10);

export function parseMessage(text: string): Parsed {
  const t = text.toLowerCase();

  // amount (₹ / rs / inr prefix, or "rupees" suffix)
  let amount: number | null = null;
  const am = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+)/i) ?? text.match(/([\d,]+)\s*(?:rs\b|rupees|rupaye|rupay)/i);
  if (am) amount = money(am[1]);

  // order id: strip currency amounts first so "₹1000" is not read as order 1000
  const noMoney = text.replace(/(?:₹|rs\.?|inr)\s*[\d,]+/gi, ' ').replace(/[\d,]+\s*(?:rs\b|rupees|rupaye|rupay)/gi, ' ');
  const om = noMoney.match(/\b(10\d{2})\b/);
  const orderId = om ? parseInt(om[1], 10) : null;

  const wm = text.match(/(\d{1,3})\s*(?:din|days?|-day)/i);
  const claimedWindowDays = wm ? parseInt(wm[1], 10) : null;

  const authorityClaim =
    /(owner|manager|malik|boss|seller|admin)[^.]*?(bola|said|approve|approved|manzoor|allowed|allow|kaha)/i.test(text) ||
    /(approve|approved|manzoor)[^.]*?(owner|manager|malik|boss|seller)/i.test(text);

  const hinglish = /[ऀ-ॿ]/.test(text) ||
    /\b(kahan|kaha|hai|nahi|chahiye|wapas|aaya|ka|ke|ko|mujhe|karo|karna|karke|hua|bhai|milta|pasand|tha|raha|kya|din|paisa|ne)\b/i.test(t);

  let intent: Intent = 'unknown';
  if (/\b(address|pata|pincode)\b/.test(t)) intent = 'address';
  else if (/\bcancel/.test(t)) intent = 'cancel';
  else if (/(refund|wapas|paisa|paise|money back|reimburse)/.test(t)) intent = 'refund';
  else if (/\breturn/.test(t)) intent = 'return';
  else if (/(kahan|kaha|where|track|status|kab\b|when|aaya nahi|nahi aaya|deliver)/.test(t)) intent = 'wismo';

  const reason: Parsed['reason'] =
    /(wrong item|wrong product|galat item|galat product|dusra item|different item)/.test(t) ? 'wrong_item' :
    /(toota|tuta|broken|damaged|damage|kharab|crack|phat|torn)/.test(t) ? 'damaged' : 'other';

  const colon = text.indexOf(':');
  const addr = colon >= 0 ? text.slice(colon + 1).trim() : '';

  return {
    lang: hinglish ? 'hinglish' : 'en',
    intent, orderId, amount, reason, claimedWindowDays, authorityClaim,
    newAddress: addr.length >= 6 ? addr : null,
    photoMentioned: /\b(photo|pic|picture|image)\b/.test(t),
  };
}

// Untrusted-text scanner. Signal only: the defence is "no verdict, no write", not this regex.
const INJECTION = /(ignore|disregard)[^.]*\b(rules?|instructions?|polic(y|ies))\b|\brefund\s+\d{3,}|\byou must\b|^\s*(system|assistant)\s*:/i;
export function scanInjection(text: string): string[] {
  const flags: string[] = [];
  if (INJECTION.test(text)) flags.push('imperative_in_untrusted_text');
  return flags;
}
export function amountFromNote(text: string): number | null {
  const m = text.match(/refund\s+(\d[\d,]*)/i);
  return m ? money(m[1]) : null;
}
