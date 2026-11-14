export type BoardSource = 'greenhouse' | 'ashby' | 'lever';

/** A pay figure or range as stated in a job posting. */
export interface Pay {
  min: number;
  max: number;
  period: 'year' | 'hour';
  /** Number of distinct ranges found in the posting (location tiers, levels). */
  tiers: number;
  /** The wording the figures were read from, for display next to the result. */
  text: string;
}

export interface Posting {
  id: string;
  title: string;
  location: string;
  department: string;
  url: string;
  postedAt: string | null;
  pay: Pay | null;
}

export interface Board {
  slug: string;
  source: BoardSource;
  /** Company name as the board reports it, when it does. */
  name: string | null;
  boardUrl: string;
  postings: Posting[];
}

export type Level =
  | 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'senior-staff' | 'principal'
  | 'manager' | 'senior-manager' | 'director' | 'senior-director' | 'executive';

export type Confidence = 'strong' | 'partial';

export interface Match {
  posting: Posting;
  confidence: Confidence;
  score: number;
  /** Plain-language reasons a reader can check. */
  reasons: string[];
  flags: MatchFlag[];
}

export type MatchFlag = 'wide-range' | 'single-figure' | 'multi-tier' | 'hourly' | 'level-differs' | 'other-location';

export interface Gap {
  status: 'below' | 'within' | 'above';
  /** Annualised range used for the comparison. */
  min: number;
  max: number;
  /** below: distance to the bottom and top of the range. */
  toMin: number;
  toMax: number;
  /** within: where the salary sits in the range, 0 to 100. */
  position: number | null;
}

export interface CheckInput {
  employer: string;
  title: string;
  salary: number;
  level?: Level | 'auto';
  location?: string;
  peers?: string[];
}

export interface EmployerSummary {
  query: string;
  found: boolean;
  slug?: string;
  source?: BoardSource;
  name?: string | null;
  boardUrl?: string;
  totalPostings?: number;
  usPostingsWithPay?: number;
}

export interface EmployerResult {
  employer: EmployerSummary;
  match: Match | null;
  gap: Gap | null;
  /** Other postings at the same employer that also matched. */
  alsoMatched: Match[];
}

export interface CheckResult {
  input: Required<Pick<CheckInput, 'employer' | 'title' | 'salary'>> & { level: Level; location: string };
  own: EmployerResult;
  peers: EmployerResult[];
  matcher: 'rules' | 'rules+ai';
  checkedAt: string;
  /** Stable id for this result, used to bind a payment to it. */
  fingerprint: string;
}
