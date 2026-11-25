// FitCircle look and feel, matching the prototype.
// Each challenge format owns a colour; gold is the sponsor's monthly jackpot.

export const C = {
  bg: '#FFFFFF',
  surface2: '#F4F2F9',
  ink: '#191630',
  muted: '#6A6684',
  line: '#E2DEEC',
  gold: '#F5A800',
  goldSoft: '#FFF6DE',
  good: '#12A150',
  warn: '#E08A00',
  bad: '#D93A3A',
  white: '#FFFFFF',
  night: '#120E22',
};

export type Format = 'peer' | 'instructor' | 'custom75' | 'fitcircle';

export const FORMAT: Record<Format, { name: string; short: string; colors: [string, string]; blurb: string; tag: string }> = {
  peer: {
    name: 'Peer Group',
    short: 'Peer',
    colors: ['#F2481F', '#FF9A1F'],
    blurb: 'Friends, family or colleagues. One weekly target, one shared stake pool.',
    tag: 'Most popular',
  },
  instructor: {
    name: 'Instructor Challenge',
    short: 'Instructor',
    colors: ['#2B55F5', '#12B0FF'],
    blurb: 'A verified trainer runs a 1–12 week programme and guides you daily.',
    tag: 'Paid programme',
  },
  custom75: {
    name: 'Custom 75-Day',
    short: '75-Day',
    colors: ['#0A9A6B', '#86C923'],
    blurb: 'Pick your daily tasks. Go Hard or Soft. Set your own rules and stakes.',
    tag: 'Premium builder',
  },
  fitcircle: {
    name: 'FitCircle Challenge',
    short: 'FitCircle',
    colors: ['#7A3DF2', '#D6338F'],
    blurb: 'Open challenges run by FitCircle. Join people across Nairobi and climb the leaderboard.',
    tag: 'Open to all',
  },
};

export const STAKES = [200, 500, 1000, 2000, 5000, 10000];
export const FORFEIT_GROUP = 60; // FitCircle's cut of forfeited stakes (75-day: 100)
export const MAX_MISSED = 3;

export const kes = (n: number | string | null | undefined) => `KES ${Math.round(Number(n ?? 0)).toLocaleString('en-KE')}`;
export const num = (n: number | string | null | undefined) => Math.round(Number(n ?? 0)).toLocaleString('en-KE');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (yyyyMm: string) => MONTHS[Number(yyyyMm.slice(5, 7)) - 1] ?? yyyyMm;
export const prettyDate = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[m - 1].slice(0, 3)}${y !== new Date().getFullYear() ? ' ' + y : ''}`;
};

/** Today in Nairobi (UTC+3) as YYYY-MM-DD, plus an offset in days. */
export const nairobiDate = (offsetDays = 0) => new Date(Date.now() + 3 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
/** The next Monday in Nairobi (never today). */
export const nextMonday = () => {
  const d = new Date(Date.now() + 3 * 3600_000);
  const add = ((8 - d.getUTCDay()) % 7) || 7;
  return nairobiDate(add);
};
