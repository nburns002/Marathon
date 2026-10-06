import { Match, MatchMessage, MatchEvidence, AdminTicket, RunSubmission, SanitizedRunSubmission, User } from '../src/types';
import { db } from './db';

export interface ViewerContext {
  userId?: string;
  role?: string;
  teamId?: string;
  isRosterA?: boolean;
  isRosterB?: boolean;
}

/**
 * Resolves viewer context from an authenticated/unauthenticated user relative to a match.
 */
export function buildViewerContext(user?: User | null, match?: Match | null): ViewerContext {
  if (!user) {
    return { role: 'SPECTATOR' };
  }

  const role = user.role;
  const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';

  if (!match) {
    return { userId: user.id, role };
  }

  // Check tournament registration roster snapshots for Team A and Team B
  let isRosterA = false;
  let isRosterB = false;

  if (match.teamAId) {
    const regA = db.data.tournamentRegistrations.find(
      (r) => r.tournamentId === match.tournamentId && r.teamId === match.teamAId
    );
    if (regA) {
      isRosterA = regA.rosterSnapshot.some((m) => m.userId === user.id) || regA.captainUserId === user.id;
    } else {
      isRosterA = db.data.teamMembers.some((m) => m.teamId === match.teamAId && m.userId === user.id);
    }
  }

  if (match.teamBId) {
    const regB = db.data.tournamentRegistrations.find(
      (r) => r.tournamentId === match.tournamentId && r.teamId === match.teamBId
    );
    if (regB) {
      isRosterB = regB.rosterSnapshot.some((m) => m.userId === user.id) || regB.captainUserId === user.id;
    } else {
      isRosterB = db.data.teamMembers.some((m) => m.teamId === match.teamBId && m.userId === user.id);
    }
  }

  return {
    userId: user.id,
    role,
    teamId: isRosterA ? match.teamAId || undefined : isRosterB ? match.teamBId || undefined : undefined,
    isRosterA,
    isRosterB
  };
}

/**
 * Sanitizes a RunSubmission into a locked indicator without revealing statistics.
 */
function createSanitizedRunIndicator(sub: RunSubmission): SanitizedRunSubmission {
  return {
    id: sub.id,
    matchId: sub.matchId,
    teamId: sub.teamId,
    runNumber: sub.runNumber,
    submittedAt: sub.submittedAt,
    locked: true,
    isRevealed: false
  };
}

/**
 * Authoritatively serializes a Match object for a given viewer context,
 * enforcing Run 1 secrecy before run1Revealed.
 */
export function serializeMatchForViewer(match: Match, viewerContext: ViewerContext): Match {
  const isAdmin = viewerContext.role === 'ADMIN' || viewerContext.role === 'SUPERADMIN';

  // If Run 1 is already revealed or viewer is admin, everything is visible
  if (match.run1Revealed || isAdmin) {
    return { ...match };
  }

  // Clone match to avoid mutating in-memory database record
  const sanitized: Match = { ...match };

  const canSeeTeamARun1 = viewerContext.isRosterA === true;
  const canSeeTeamBRun1 = viewerContext.isRosterB === true;

  if (!canSeeTeamARun1) {
    if (match.teamARun1) {
      sanitized.teamARun1 = createSanitizedRunIndicator(match.teamARun1) as any;
    } else {
      sanitized.teamARun1 = null;
    }
  }

  if (!canSeeTeamBRun1) {
    if (match.teamBRun1) {
      sanitized.teamBRun1 = createSanitizedRunIndicator(match.teamBRun1) as any;
    } else {
      sanitized.teamBRun1 = null;
    }
  }

  // Mask final scores before Run 1 is revealed for anyone who cannot see both scores
  if (!canSeeTeamARun1 || !canSeeTeamBRun1) {
    sanitized.finalScoreA = null;
    sanitized.finalScoreB = null;
  }

  return sanitized;
}

/**
 * Sanitizes match messages so unrevealed Run 1 statistics and raw score commands
 * do not leak to opponents or spectators.
 */
export function serializeMessagesForViewer(
  messages: MatchMessage[],
  viewerContext: ViewerContext,
  match: Match
): MatchMessage[] {
  const isAdmin = viewerContext.role === 'ADMIN' || viewerContext.role === 'SUPERADMIN';
  if (match.run1Revealed || isAdmin) {
    return messages;
  }

  return messages.map((msg) => {
    // Check if this message pertains to Run 1 score submission
    const isRun1Submission =
      msg.type === 'SCORE_SUBMISSION' ||
      (msg.structuredScore && msg.structuredScore.runNumber === 1) ||
      (msg.message && msg.message.includes('/score run1')) ||
      (msg.message && msg.message.includes('RUN 1 SUBMITTED'));

    if (!isRun1Submission) {
      return msg;
    }

    // Determine which team this submission belongs to
    const isTeamA = msg.teamId === match.teamAId || (msg.structuredScore && msg.structuredScore.teamId === match.teamAId);
    const isTeamB = msg.teamId === match.teamBId || (msg.structuredScore && msg.structuredScore.teamId === match.teamBId);

    const isViewerSubmittingTeam =
      (isTeamA && viewerContext.isRosterA) ||
      (isTeamB && viewerContext.isRosterB);

    if (isViewerSubmittingTeam) {
      // Submitting team member may see their own message and breakdown
      return msg;
    }

    // Opponent and spectators receive only the sanitized indicator message
    const submittingTeamName = isTeamA ? (match.teamAName || 'Team A') : (match.teamBName || 'Team B');
    return {
      ...msg,
      message: `SYSTEM — ${submittingTeamName} submitted and locked Run 1.`,
      structuredScore: undefined
    };
  });
}

/**
 * Authoritatively filters match evidence to prevent unrevealed Run 1 VOD leaks
 * to opponents and spectators before Run 1 is officially revealed.
 */
export function serializeEvidenceForViewer(
  evidenceList: MatchEvidence[],
  viewerContext: ViewerContext,
  match: Match
): MatchEvidence[] {
  const isAdmin = viewerContext.role === 'ADMIN' || viewerContext.role === 'SUPERADMIN';
  if (match.run1Revealed || isAdmin) {
    return evidenceList;
  }

  return evidenceList.filter((ev) => {
    // If evidence is explicitly for Run 1, enforce strict secrecy
    const isRun1 = ev.runNumber === 1;
    if (!isRun1) {
      return true;
    }

    // Team A roster may see Team A Run 1 evidence
    if (viewerContext.isRosterA && ev.teamId === match.teamAId) {
      return true;
    }

    // Team B roster may see Team B Run 1 evidence
    if (viewerContext.isRosterB && ev.teamId === match.teamBId) {
      return true;
    }

    // Opposing team and spectators cannot receive unrevealed Run 1 evidence
    return false;
  });
}

/**
 * Authoritatively filters admin tickets based on viewer role.
 * Anonymous spectators receive no tickets.
 * Participants receive only tickets created by themselves or their team.
 * Admins receive full ticket data.
 */
export function serializeAdminTicketsForViewer(
  tickets: AdminTicket[],
  viewerContext: ViewerContext
): AdminTicket[] {
  const isAdmin = viewerContext.role === 'ADMIN' || viewerContext.role === 'SUPERADMIN';
  if (isAdmin) {
    return tickets;
  }

  // Anonymous spectators receive no admin tickets
  if (!viewerContext.userId) {
    return [];
  }

  // Requesting participant: see only their own tickets or their team's tickets
  return tickets.filter((t) => {
    if (t.requestingUserId === viewerContext.userId) {
      return true;
    }
    if (t.requestingTeamId && viewerContext.teamId && t.requestingTeamId === viewerContext.teamId) {
      return true;
    }
    return false;
  });
}
