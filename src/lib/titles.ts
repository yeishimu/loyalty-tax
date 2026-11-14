import type { Level } from './types';

/**
 * Seniority on one numeric ladder so levels can be compared. Individual
 * contributors run 0 to 6; people managers start at 7, which keeps
 * "Senior Engineer" and "Engineering Manager" from matching each other.
 */
export const LEVEL_RANK: Record<Level, number> = {
  intern: 0, junior: 1, mid: 2, senior: 3, staff: 4, 'senior-staff': 4.5, principal: 5,
  manager: 7, 'senior-manager': 7.5, director: 8.5, 'senior-director': 9, executive: 10,
};

export const LEVEL_LABEL: Record<Level, string> = {
  intern: 'Intern', junior: 'Junior', mid: 'Mid-level', senior: 'Senior', staff: 'Staff',
  'senior-staff': 'Senior Staff', principal: 'Principal', manager: 'Manager',
  'senior-manager': 'Senior Manager', director: 'Director', 'senior-director': 'Senior Director',
  executive: 'VP or above',
};

const SYNONYMS: Array<[RegExp, string]> = [
  [/\bswe\b/g, 'software engineer'],
  [/\bsde\b/g, 'software engineer'],
  [/\b(software )?developer\b/g, 'software engineer'],
  [/\bfront[\s-]end\b/g, 'frontend'],
  [/\bback[\s-]end\b/g, 'backend'],
  [/\bfull[\s-]stack\b/g, 'fullstack'],
  [/\bhrbp\b/g, 'people partner'],
  [/\bhr business partner\b/g, 'people partner'],
  [/\bhuman resources\b/g, 'people'],
  [/\bsdr\b/g, 'sales development representative'],
  [/\bbdr\b/g, 'business development representative'],
  [/\bae\b/g, 'account executive'],
  [/\bcsm\b/g, 'customer success manager'],
  [/\bpm\b/g, 'product manager'],
  [/\btpm\b/g, 'technical program manager'],
  [/\bml\b/g, 'machine learning'],
  [/\bsre\b/g, 'site reliability engineer'],
  [/\bux\b/g, 'product'],
  [/\bfp&a\b/g, 'finance strategy'],
  [/\bfinancial\b/g, 'finance'],
  [/\brecruiting\b/g, 'recruiter'],
  [/\bsales engineer\b/g, 'solutions engineer'],
  [/\bpresales engineer\b/g, 'solutions engineer'],
  [/\bsolution engineer\b/g, 'solutions engineer'],
];

/** Words that name a job family on their own and so prove little when matched alone. */
const GENERIC = new Set([
  'engineer', 'manager', 'analyst', 'specialist', 'associate', 'representative', 'lead',
  'coordinator', 'partner', 'consultant', 'executive', 'designer', 'scientist', 'operations',
  'business', 'program', 'strategy', 'technical', 'global', 'development',
]);

/**
 * The noun that says what kind of job it is. Two titles with different head
 * nouns ("Data Engineer", "Data Scientist") are different jobs however many
 * other words they share.
 */
const HEAD_NOUNS = new Set([
  'engineer', 'scientist', 'designer', 'analyst', 'manager', 'recruiter', 'accountant', 'counsel',
  'representative', 'executive', 'specialist', 'partner', 'coordinator', 'researcher', 'writer',
  'architect', 'consultant', 'strategist', 'advocate', 'investigator', 'attorney', 'paralegal',
  'controller', 'auditor', 'technician', 'administrator', 'editor', 'producer', 'agent',
]);

const STOP = new Set([
  'the', 'and', 'of', 'for', 'a', 'an', 'to', 'in', 'at', 'on', 'with', 'us', 'usa', 'remote',
  'team', 'new', 'hybrid', 'based', 'speaking', 'contract', 'temporary', 'role', 'start', 'summer',
  'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7',
]);

const LEVEL_WORDS = /\b(intern(ship)?|stagiaire|apprentice|co-?op|new grad(uate)?|early career|entry level|entry|junior|jr|associate|mid level|mid|senior|sr|staff|lead|principal|distinguished|fellow|i|ii|iii|iv|v|1|2|3|4|5)\b/g;

function clean(raw: string): string {
  let t = ' ' + raw.toLowerCase().replace(/[()\[\],/:•.·|]/g, ' ').replace(/\s[-–—]\s/g, ' ').replace(/\s+/g, ' ') + ' ';
  for (const [re, to] of SYNONYMS) t = t.replace(re, to);
  return t;
}

export interface ParsedTitle {
  level: Level;
  /** True when the title itself states a level; false when mid-level was assumed. */
  levelStated: boolean;
  track: 'ic' | 'mgmt';
  /** Role words from the whole title. */
  words: string[];
  /** Role words from the part before the first separator: the job itself. */
  core: string[];
}

function detectLevel(t: string, head: string): { level: Level; stated: boolean; track: 'ic' | 'mgmt' } {
  if (/\b(vp|vice president|head of|chief|svp|evp|cto|cfo|coo)\b/.test(t)) return { level: 'executive', stated: true, track: 'mgmt' };
  if (/\b(senior|sr) director\b/.test(t)) return { level: 'senior-director', stated: true, track: 'mgmt' };
  if (/\bdirector\b/.test(t)) return { level: 'director', stated: true, track: 'mgmt' };

  // "Manager, Payments" and "Engineering Manager" lead people. "Product Manager",
  // "Account Manager" and similar are individual roles that happen to end in manager.
  const peopleManager = /^\s?(senior |sr )?manager\b/.test(head) || /\b(engineering|design|data science|recruiting|sales|support|operations) manager\b/.test(t) || /\bmanager of\b/.test(t);
  if (peopleManager) {
    return { level: /\b(senior|sr) manager\b|^\s?(senior|sr) /.test(head) || /\b(senior|sr) (engineering )?manager\b/.test(t) ? 'senior-manager' : 'manager', stated: true, track: 'mgmt' };
  }

  if (/\b(intern(ship)?|stagiaire|apprentice|co-?op)\b/.test(t)) return { level: 'intern', stated: true, track: 'ic' };
  // "Group Product Manager" sits above senior at the companies that use it.
  if (/\bgroup (product|program|engineering)\b/.test(t)) return { level: 'principal', stated: true, track: 'ic' };
  if (/\b(distinguished|fellow|principal)\b/.test(t)) return { level: 'principal', stated: true, track: 'ic' };
  if (/\b(senior|sr) staff\b/.test(t)) return { level: 'senior-staff', stated: true, track: 'ic' };
  if (/\b(staff|lead|iv|4)\b/.test(t)) return { level: 'staff', stated: true, track: 'ic' };
  if (/\b(senior|sr|iii|3)\b/.test(t)) return { level: 'senior', stated: true, track: 'ic' };
  if (/\b(new grad(uate)?|early career|entry|junior|jr|associate)\b/.test(t) || /\b(i|1)\s?$/.test(head.trim())) return { level: 'junior', stated: true, track: 'ic' };
  if (/\b(ii|2|mid)\b/.test(t)) return { level: 'mid', stated: true, track: 'ic' };
  return { level: 'mid', stated: false, track: 'ic' };
}

function roleWords(t: string, track: 'ic' | 'mgmt'): string[] {
  const words = t.replace(LEVEL_WORDS, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
  const out = track === 'mgmt' ? words.filter((w) => w !== 'manager' && w !== 'director') : words;
  return [...new Set(out)];
}

export function parseTitle(raw: string): ParsedTitle {
  const headRaw = raw.split(/,|\(|\s[-–—]\s|:/)[0] || raw;
  const t = clean(raw);
  const head = clean(headRaw);
  const { level, stated, track } = detectLevel(t, head);
  const words = roleWords(t, track);
  let core = roleWords(head, track);
  // "Manager, Payments" has an empty head once "manager" is removed: fall back to everything.
  if (!core.length) core = words;
  return { level, levelStated: stated, track, words, core };
}

const weight = (w: string) => (GENERIC.has(w) ? 0.5 : 1);
const sum = (ws: string[]) => ws.reduce((a, w) => a + weight(w), 0);

export interface TitleScore {
  score: number;
  role: number;
  levelGap: number;
  sameTrack: boolean;
  /** At least one distinguishing (non-generic) word is shared. */
  specificHit: boolean;
}

/**
 * Compare what the user calls their job with a posting's title.
 * role: how much of the user's job is in the posting, and how little else the
 * posting's core is about. The level then scales it down: a posting one rung
 * away can never score as a strong match.
 */
export function scoreTitles(user: ParsedTitle, userLevel: Level, posting: ParsedTitle): TitleScore {
  const none = { score: 0, role: 0, levelGap: 99, sameTrack: false, specificHit: false };
  if (!user.words.length || !posting.words.length) return none;

  let found = 0;
  let specificHit = false;
  const userSpecific = user.words.filter((w) => !GENERIC.has(w));
  for (const w of user.words) {
    if (posting.core.includes(w)) { found += weight(w); if (!GENERIC.has(w)) specificHit = true; }
    else if (posting.words.includes(w)) { found += 0.8 * weight(w); if (!GENERIC.has(w)) specificHit = true; }
  }
  if (userSpecific.length && !specificHit) return none;

  // English puts the kind of job last: an "Accountant Partnerships Manager" is a manager, not an accountant.
  const userHead = user.core.filter((w) => HEAD_NOUNS.has(w)).pop();
  const postingHead = posting.core.filter((w) => HEAD_NOUNS.has(w)).pop();
  if (userHead && postingHead && userHead !== postingHead) return none;

  const recall = found / sum(user.words);
  const precision = sum(posting.core.filter((w) => user.words.includes(w))) / sum(posting.core);
  const role = 0.65 * recall + 0.35 * precision;

  const userTrack = LEVEL_RANK[userLevel] >= 7 ? 'mgmt' : 'ic';
  const sameTrack = userTrack === posting.track;
  const levelGap = Math.abs(LEVEL_RANK[userLevel] - LEVEL_RANK[posting.level]);
  const levelFit = !sameTrack ? 0.05 : levelGap === 0 ? 1 : levelGap <= 0.5 ? 0.5 : levelGap <= 1 ? 0.4 : levelGap <= 2 ? 0.15 : 0;

  return { score: role * (0.55 + 0.45 * levelFit), role, levelGap, sameTrack, specificHit };
}
