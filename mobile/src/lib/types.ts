import type { Format } from './theme';

// Shapes returned by the FitCircle API (backend/src/routes)

export interface Me {
  id: number;
  firstName: string;
  lastName: string | null;
  phone: string;
  role: 'member' | 'instructor' | 'admin';
  status: string;
  age: number;
  canStake: boolean;
  goals: string[];
  termsVersion: string | null;
  instructor: { displayName: string; verification: 'pending' | 'verified' | 'rejected' | 'suspended'; verifiedAt: string | null } | null;
}

export type ChallengeStatus = 'draft' | 'enrolling' | 'active' | 'settled' | 'cancelled';

export interface ChallengeSummary {
  id: number;
  type: Format;
  title: string;
  status: ChallengeStatus;
  startDate: string;
  endDate: string;
  durationDays: number;
  sessionsPerWeek: number;
  mode75: 'hard' | 'soft' | null;
  isStaked: number;
  stake: number | null;
  entryFee: number | null;
  feePct: number;
  forfeitPct: number;
  capacity: number | null;
  instructorId: number | null;
  instructorName: string | null;
  members: number;
  description?: string | null;
  myStatus?: string | null;
  myAmountPaid?: number | null;
  isHost?: number;
}

export interface ChallengeDetail extends ChallengeSummary {
  inviteCode?: string;
  stakePool: number | null;
  forfeited: number | null;
  tasks: { id: number; title: string }[];
  settlement: {
    gross: number; forfeited: number; forfeitPct: number; fee: number; completers: number; forfeiters: number;
    bonusEach: number; amountEach: number; settledAt: string;
  } | null;
  winner: { userId: number; firstName: string; sessions: number; bestStreak: number } | null;
  me: { status: string | null; amountPaid: number | null; isHost: boolean; mustPay: boolean };
}

export interface LeaderRow {
  userId: number; firstName: string; week: number; sessionsThisWeek: number; weeklyTarget: number;
  loggedToday: number; streak: number; bestStreak: number; atRisk: number; isMe: number;
}

export interface FeedItem {
  id: number; userId: number; firstName: string; date: string; loggedAt: string; activity: string | null; caption: string | null;
  mediaType: 'photo' | 'video'; status: string; flaggedByMe: number; mediaUrl: string;
}

export interface Notice { id: number; type: string; title: string; body: string | null; data: any; readAt: string | null; createdAt: string }

export interface Jackpot {
  current: { month: string; prize: string; prizeValue: number | null; sponsor: string; resetsOn: string } | null;
  leaders: { rank: number; firstName: string; sessions: number; bestStreak: number; isMe: boolean }[];
  me: { rank: number; sessions: number; bestStreak: number } | null;
  pastWinners: { month: string; firstName: string; sessions: number; bestStreak: number; decidedBy: string; prize: string; sponsor: string }[];
}

export interface Flag {
  id: number; reason: string; note: string | null; createdAt: string; logId: number; challengeId: number; date: string;
  activity: string | null; mediaType: 'photo' | 'video'; ownerId: number; ownerName: string; flaggedByName: string; mediaUrl: string;
}

export interface Dashboard {
  profile: { displayName: string; verification: string; verifiedAt: string | null; payoutPhone: string };
  documents: { docType: 'certification' | 'national_id' | 'demo_video'; status: string; uploadedAt: string }[];
  programmes: {
    challengeId: number; title: string; status: ChallengeStatus; startDate: string; endDate: string; participants: number;
    feesCollected: number; yourShare: number; loggedToday: number; atRisk: number; openFlags: number;
  }[];
  earnings: { earned: number; pending: number; monthly: { month: string; amount: number }[] };
  payouts: { id: number; challengeId: number; title: string; amount: number; status: string; scheduledFor: string; sentAt: string | null }[];
}
