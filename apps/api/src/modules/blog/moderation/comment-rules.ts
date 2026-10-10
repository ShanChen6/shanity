/**
 * Layer 1 of comment moderation: local rules, no network. A hit rejects the
 * comment outright; everything else goes on to the AI layer.
 *
 * Matching is deliberately on the written form, diacritics included:
 * Vietnamese without its marks collapses unrelated words together (an
 * obscenity stripped of its marks is the everyday word "các"), so stripping
 * them would reject innocent comments. Abbreviations people actually type
 * (vcl, đm, ...) are listed as such.
 */

export type RuleCode =
  'SPAM_LINK' | 'CONTACT_INFO' | 'PROFANITY' | 'BLOCKED_TERM' | 'REPEATED_TEXT';

export interface RuleViolation {
  rule: RuleCode;
}

export interface CommentRulesConfig {
  /** Hosts whose links are fine (subdomains included). */
  allowedHosts: readonly string[];
  /** Operator-supplied terms (e.g. political), from COMMENT_BLOCKLIST. */
  blockedTerms: readonly string[];
}

/** Links that are fine in a technical discussion. */
export const DEFAULT_ALLOWED_HOSTS = [
  'developer.mozilla.org',
  'github.com',
  'stackoverflow.com',
  'wikipedia.org',
  'w3.org',
  'nodejs.org',
  'react.dev',
  'nextjs.org',
  'typescriptlang.org',
  'python.org',
  'docs.python.org',
] as const;

/** Profanity as people type it in Vietnamese and English. */
export const PROFANITY = [
  // Vietnamese
  'địt',
  'đụ',
  'đéo',
  'lồn',
  'buồi',
  'cặc',
  'đĩ',
  'đồ chó',
  'óc chó',
  'vãi lồn',
  'vãi cả lồn',
  'con đĩ',
  'thằng chó',
  // Abbreviations
  'đm',
  'đmm',
  'dm',
  'dmm',
  'dcm',
  'đcm',
  'vcl',
  'vkl',
  'vcc',
  'cmm',
  'clm',
  // English
  'fuck',
  'fucking',
  'motherfucker',
  'shit',
  'bitch',
  'cunt',
  'asshole',
  'dickhead',
] as const;

const SHORTENERS = [
  'bit.ly',
  'tinyurl.com',
  'cutt.ly',
  'shorturl.at',
  'goo.gl',
  't.ly',
  'rebrand.ly',
  'is.gd',
  'ow.ly',
  'rb.gy',
  'tiny.cc',
];

// Explicit links, and bare domains on TLDs spammers use. Code-ish names
// (next.config.ts, socket.io, Node.js) are deliberately not matched.
const EXPLICIT_LINK = /\b(?:https?:\/\/|www\.)[^\s<>()]+/giu;
const BARE_DOMAIN =
  /\b(?:[a-z0-9-]+\.)+(?:com|net|org|vn|xyz|top|club|info|site|online|shop|store|link|click|ru|cn|ly|biz|live|win|bet|vip)(?:\/[^\s<>()]*)?(?![\p{L}\p{N}])/giu;

// Vietnamese phone numbers, separators allowed (0912 345 678, +84.912...).
const PHONE = /(?:\+?84|\b0)(?:[\s.-]?\d){8,10}\b/u;
const CONTACT_LINK = /\b(?:t\.me|telegram\.me|zalo\.me)\//iu;
const CONTACT_HANDLE =
  /\b(?:zalo|tele(?:gram)?|tg|wechat|whatsapp)\b[\s:.-]*(?:@[\w.]{3,}|\+?\d(?:[\s.-]?\d){7,})/iu;

const REPEATED_CHAR = /(.)\1{9,}/u;
const REPEATED_WORD =
  /(?<![\p{L}\p{N}])([\p{L}\p{N}]+)(?:\s+\1){5,}(?![\p{L}\p{N}])/iu;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A whole-word, case-insensitive matcher for a list of terms. */
function termMatcher(terms: readonly string[]) {
  const parts = terms
    .map((term) => term.trim().normalize('NFC').toLowerCase())
    .filter(Boolean)
    .map((term) => escape(term).replace(/\s+/g, '\\s+'));
  if (!parts.length) return null;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${parts.join('|')})(?![\\p{L}\\p{N}])`,
    'iu',
  );
}

/** "đ.ị.t", "f*u*c*k": separators between single letters are dropped. */
function deobfuscate(text: string) {
  return text.replace(
    /(?<![\p{L}])(\p{L})(?:[.*_\-~]+(\p{L}))+(?![\p{L}])/gu,
    (match) => match.replace(/[.*_\-~]+/g, ''),
  );
}

const hostOf = (link: string) => {
  try {
    const url = new URL(/^https?:\/\//i.test(link) ? link : `http://${link}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

const isAllowedHost = (host: string, allowed: readonly string[]) =>
  allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));

export class CommentRules {
  private readonly profanity = termMatcher(PROFANITY)!;
  private readonly blocked: RegExp | null;

  constructor(private readonly config: CommentRulesConfig) {
    this.blocked = termMatcher(config.blockedTerms);
  }

  /** The first rule the comment breaks, or null if it passes layer 1. */
  check(content: string): RuleViolation | null {
    const text = content.normalize('NFC');
    if (
      CONTACT_LINK.test(text) ||
      CONTACT_HANDLE.test(text) ||
      PHONE.test(text)
    )
      return { rule: 'CONTACT_INFO' };
    if (this.hasForeignLink(text)) return { rule: 'SPAM_LINK' };
    const lowered = text.toLowerCase();
    const plain = deobfuscate(lowered);
    if (this.profanity.test(lowered) || this.profanity.test(plain))
      return { rule: 'PROFANITY' };
    if (
      this.blocked &&
      (this.blocked.test(lowered) || this.blocked.test(plain))
    )
      return { rule: 'BLOCKED_TERM' };
    if (REPEATED_CHAR.test(text) || REPEATED_WORD.test(text))
      return { rule: 'REPEATED_TEXT' };
    return null;
  }

  private hasForeignLink(text: string) {
    const links = [
      ...text.matchAll(EXPLICIT_LINK),
      ...text.matchAll(BARE_DOMAIN),
    ].map((match) => match[0]);
    return links.some((link) => {
      const host = hostOf(link);
      if (!host) return true;
      if (SHORTENERS.some((s) => host === s || host.endsWith(`.${s}`)))
        return true;
      return !isAllowedHost(host, this.config.allowedHosts);
    });
  }
}

/** Rules configured from the environment. */
export function commentRulesFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const list = (value: string | undefined) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  const site = (() => {
    try {
      return new URL(env.WEB_ORIGIN ?? '').hostname;
    } catch {
      return null;
    }
  })();
  return new CommentRules({
    allowedHosts: [
      ...DEFAULT_ALLOWED_HOSTS,
      ...(site ? [site] : []),
      ...list(env.COMMENT_LINK_ALLOWLIST).map((host) => host.toLowerCase()),
    ],
    blockedTerms: list(env.COMMENT_BLOCKLIST),
  });
}
