const STATES: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado',
  CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho',
  IL: 'illinois', IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky', LA: 'louisiana',
  ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan', MN: 'minnesota',
  MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada',
  NH: 'new hampshire', NJ: 'new jersey', NM: 'new mexico', NY: 'new york', NC: 'north carolina',
  ND: 'north dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania',
  RI: 'rhode island', SC: 'south carolina', SD: 'south dakota', TN: 'tennessee', TX: 'texas',
  UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington', WV: 'west virginia',
  WI: 'wisconsin', WY: 'wyoming', DC: 'district of columbia',
};

const US_CITIES = [
  'new york', 'nyc', 'san francisco', 'bay area', 'seattle', 'austin', 'chicago', 'boston',
  'denver', 'los angeles', 'atlanta', 'washington', 'mountain view', 'menlo park', 'palo alto',
  'san jose', 'sunnyvale', 'bellevue', 'portland', 'miami', 'dallas', 'houston', 'phoenix',
  'philadelphia', 'pittsburgh', 'salt lake city', 'san diego', 'minneapolis', 'nashville',
  'raleigh', 'charlotte', 'detroit', 'brooklyn', 'oakland', 'sacramento', 'westlake',
];

const NON_US = /\b(canada|toronto|vancouver|montreal|ontario|united kingdom|uk|london|dublin|ireland|germany|berlin|munich|france|paris|india|bengaluru|bangalore|hyderabad|singapore|japan|tokyo|australia|sydney|melbourne|brazil|s[aã]o paulo|mexico|israel|tel aviv|netherlands|amsterdam|spain|madrid|barcelona|poland|warsaw|ukraine|emea|apac|latam|europe|philippines|korea|seoul|china|hong kong|taiwan|sweden|stockholm|switzerland|zurich|italy|portugal|lisbon|argentina|colombia|nigeria|kenya|uae|dubai|serbia|romania|czech|costa rica)\b/i;

// State codes are case-sensitive on purpose: ", OR" is Oregon, ", or" is a conjunction.
const STATE_CODE = new RegExp(`(?:,|\\s-|^)\\s?(${Object.keys(STATES).join('|')})\\b`);
const US_WORDS = new RegExp(`\\b(united states|usa|u\\.s\\.a?\\.?|us|${Object.values(STATES).join('|')}|${US_CITIES.join('|')})\\b`, 'i');

/** True when a posting's location text places the job in the United States. */
export function isUS(location: string | null | undefined): boolean {
  const loc = String(location ?? '').trim();
  if (!loc) return false;
  // "Remote - US", "United States - Remote", "San Francisco, CA; Toronto, Canada" all count.
  const parts = loc.split(/[;•|]|\bor\b/i).map((p) => p.trim()).filter(Boolean);
  return parts.some((p) => {
    if (/\b(us|usa|united states|u\.s\.)\b/i.test(p)) return true;
    if (NON_US.test(p)) return false;
    return STATE_CODE.test(p) || US_WORDS.test(p);
  });
}

/** Loose check that a posting is in the user's own city or state, or is US-remote. */
export function sameArea(postingLocation: string, userLocation: string): boolean {
  const want = userLocation.toLowerCase().replace(/[^a-z\s,]/g, ' ').trim();
  if (!want) return false;
  const have = postingLocation.toLowerCase();
  const words = want.split(/[,]/).map((w) => w.trim()).filter((w) => w.length > 1);
  for (const w of words) {
    if (have.includes(w)) return true;
    const code = w.toUpperCase();
    if (STATES[code] && (have.includes(STATES[code]) || new RegExp(`\\b${code}\\b`).test(postingLocation))) return true;
    const asCode = Object.entries(STATES).find(([, name]) => name === w)?.[0];
    if (asCode && new RegExp(`\\b${asCode}\\b`).test(postingLocation)) return true;
  }
  return false;
}

export const isRemote = (location: string) => /\bremote\b/i.test(location);
