export interface User {
  id: string;
  email: string;
  passwordHash: string;
  username: string;
  displayName: string;
  bungieId: string;
  avatarUrl: string;
  role: 'PLAYER' | 'CAPTAIN' | 'ADMIN' | 'SUPERADMIN';
  accountStatus: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: 'CAPTAIN' | 'MEMBER';
  membershipStatus: 'ACTIVE' | 'INVITED' | 'DECLINED';
  joinedAt: string;
  user?: {
    id: string;
    username: string;
    displayName: string;
    bungieId: string;
    avatarUrl: string;
  };
}

export interface Team {
  id: string;
  name: string;
  tag: string;
  logoUrl: string;
  captainUserId: string;
  createdAt: string;
  captain?: User;
  members?: TeamMember[];
  stats?: {
    tournamentsPlayed: number;
    matchesWon: number;
    matchesLost: number;
    championships: number;
  };
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  captainName: string;
  invitedUserId: string;
  invitedByUserId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}

export type TournamentStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_LOCKED'
  | 'BRACKET_GENERATING'
  | 'LIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Tournament {
  id: string;
  title: string;
  description: string;
  map: string;
  format: string; // e.g. "3-player Public-Lobby Score Race"
  runsPerMatch: number; // default 2
  entryFee: number; // in USD (e.g. 30)
  prizePool: number; // in USD (e.g. 1000)
  maxTeams: number;
  featuredObjectiveTitle: string;
  featuredObjectiveDescription: string;
  featuredObjectivePoints: number; // default 5
  registrationOpenAt: string;
  registrationCloseAt: string;
  tournamentStartAt: string;
  readyWindowMinutes: number; // default 10
  matchWindowMinutes: number; // default 75
  disputeWindowMinutes: number; // default 10
  roundIntermissionMinutes: number; // default 10
  status: TournamentStatus;
  currentRound: number;
  rulesText?: string;
  createdAt: string;
  updatedAt: string;
  registeredCount?: number;
  championTeamId?: string | null;
  championTeamName?: string | null;
}

export interface TournamentRosterMember {
  userId: string;
  usernameSnapshot: string;
  displayNameSnapshot: string;
  bungieIdSnapshot: string;
}

export interface TournamentRegistration {
  id: string;
  tournamentId: string;
  teamId: string;
  teamName: string;
  captainUserId: string;
  status: 'REGISTERED' | 'NOT_REGISTERED' | 'CANCELLED' | 'REFUNDED' | 'DISQUALIFIED';
  paymentStatus: 'PAYMENT_REQUIRED' | 'PAYMENT_PENDING' | 'PAID' | 'PAYMENT_FAILED' | 'REFUNDED';
  rosterSnapshot: TournamentRosterMember[];
  registeredAt: string;
  termsAcceptedAt: string;
  refundPolicyAcceptedAt: string;
}

export type MatchStatus =
  | 'WAITING_FOR_ROUND'
  | 'READY_CHECK'
  | 'ACTIVE'
  | 'RUN_1_PARTIAL'
  | 'RUN_1_COMPLETE'
  | 'RESULT_PENDING'
  | 'DISPUTED'
  | 'ADMIN_REVIEW'
  | 'FINAL'
  | 'FORFEIT'
  | 'DOUBLE_FORFEIT'
  | 'CANCELLED';

export interface RunSubmission {
  id: string;
  matchId: string;
  teamId: string;
  runNumber: 1 | 2;
  runnerKills: number;
  extractedCredits: number;
  playersExtracted: 0 | 1 | 2 | 3;
  objectiveCompleted: boolean;
  killPoints: number;
  lootPoints: number;
  objectivePoints: number;
  baseScore: number;
  survivalMultiplier: number;
  finalRunScore: number;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  evidenceUrl?: string;
  locked: boolean;
}

export interface MatchReadyStatus {
  teamId: string;
  ready: boolean;
  readyAt?: string | null;
  captainUserId?: string;
}

export interface MatchMessage {
  id: string;
  matchId: string;
  userId: string;
  userName: string;
  userRole: string;
  teamId?: string;
  teamName?: string;
  type: 'CHAT' | 'SYSTEM' | 'SCORE_SUBMISSION' | 'ADMIN' | 'FLAG' | 'FORFEIT';
  message: string;
  structuredScore?: RunSubmission;
  createdAt: string;
}

export interface MatchEvidence {
  id: string;
  matchId: string;
  teamId: string;
  teamName: string;
  runNumber?: 1 | 2;
  type: 'VOD' | 'SCREENSHOT' | 'CLIP' | 'LOG';
  url: string;
  description?: string;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
}

export interface MatchDispute {
  id: string;
  matchId: string;
  requestingTeamId: string;
  requestingTeamName: string;
  disputedTeamId: string;
  disputedTeamName: string;
  runNumber?: 1 | 2;
  category: string;
  description: string;
  evidenceUrls: string[];
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  assignedAdminId?: string | null;
  assignedAdminName?: string | null;
  resolution?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTicket {
  id: string;
  matchId?: string;
  tournamentId?: string;
  requestingUserId: string;
  requestingUserName: string;
  requestingTeamId?: string;
  requestingTeamName?: string;
  category: string;
  description: string;
  status: 'OPEN' | 'CLAIMED' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  assignedAdminId?: string | null;
  assignedAdminName?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Match {
  id: string;
  tournamentId: string;
  round: number;
  matchNumber: number;
  bracketPosition: number;
  nextMatchId?: string | null;
  nextMatchSlot?: 'A' | 'B' | null;
  teamAId?: string | null;
  teamBId?: string | null;
  teamAName?: string | null;
  teamBName?: string | null;
  teamALogo?: string | null;
  teamBLogo?: string | null;
  winnerTeamId?: string | null;
  loserTeamId?: string | null;
  isBye: boolean;
  matchStatus: MatchStatus;
  readyDeadlineAt?: string | null;
  matchStartedAt?: string | null;
  matchDeadlineAt?: string | null;
  disputeDeadlineAt?: string | null;
  intermissionDeadlineAt?: string | null;
  finalScoreA?: number | null;
  finalScoreB?: number | null;
  forfeitReason?: string | null;
  adminNotes?: string | null;
  teamAReady?: boolean;
  teamBReady?: boolean;
  teamAReadyAt?: string | null;
  teamBReadyAt?: string | null;
  teamARun1?: RunSubmission | null;
  teamBRun1?: RunSubmission | null;
  teamARun2?: RunSubmission | null;
  teamBRun2?: RunSubmission | null;
  run1Revealed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Bracket {
  id: string;
  tournamentId: string;
  totalRounds: number;
  bracketSize: number;
  generatedAt: string;
  matches: Match[];
}

export interface AdminAction {
  id: string;
  adminId: string;
  adminName: string;
  tournamentId?: string;
  matchId?: string;
  action: string;
  oldValue?: string | null;
  newValue?: string | null;
  reason: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorId: string;
  actorName: string;
  action: string;
  entityType: 'TOURNAMENT' | 'MATCH' | 'TEAM' | 'USER' | 'PAYMENT' | 'BRACKET';
  entityId: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string;
  linkUrl?: string;
  read: boolean;
  createdAt: string;
}
