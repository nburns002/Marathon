import { v4 as uuidv4 } from 'uuid';
import { Match, Bracket, TournamentRegistration } from '../src/types';

export interface SeededTeam {
  teamId: string;
  teamName: string;
  teamLogo?: string;
  seed: number;
}

/**
 * Calculates next power of 2 for bracket size (e.g. 13 -> 16, 27 -> 32, 47 -> 64).
 */
export function getBracketSize(teamCount: number): number {
  if (teamCount <= 2) return 2;
  return Math.pow(2, Math.ceil(Math.log2(teamCount)));
}

/**
 * Calculates total rounds for a bracket size (e.g. 16 -> 4 rounds, 32 -> 5 rounds, 64 -> 6 rounds).
 */
export function getTotalRounds(bracketSize: number): number {
  return Math.log2(bracketSize);
}

/**
 * Fisher-Yates server-side random shuffle.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generates an authoritative single-elimination tournament bracket with random seeding and random byes.
 */
export function generateSingleEliminationBracket(
  tournamentId: string,
  confirmedRegistrations: TournamentRegistration[],
  teamLookup: Record<string, { name: string; logoUrl?: string }>,
  roundIntermissionMinutes = 10
): {
  bracket: Bracket;
  matches: Match[];
  seedAudit: SeededTeam[];
} {
  const registeredCount = confirmedRegistrations.length;
  if (registeredCount < 2) {
    throw new Error('At least 2 confirmed teams are required to generate a tournament bracket.');
  }

  // 1. Shuffle registered teams randomly
  const shuffledRegs = shuffleArray(confirmedRegistrations);
  const seedAudit: SeededTeam[] = shuffledRegs.map((reg, index) => ({
    teamId: reg.teamId,
    teamName: reg.teamName,
    teamLogo: teamLookup[reg.teamId]?.logoUrl,
    seed: index + 1
  }));

  const bracketSize = getBracketSize(registeredCount);
  const totalRounds = getTotalRounds(bracketSize);
  const bracketId = uuidv4();
  const now = new Date().toISOString();

  // Create slot array of size bracketSize (some may be null for BYEs)
  // To distribute byes randomly, we put teams in positions and empty slots become byes
  const slots: (SeededTeam | null)[] = new Array(bracketSize).fill(null);
  
  // Fill first `registeredCount` slots with seeded teams
  for (let i = 0; i < registeredCount; i++) {
    slots[i] = seedAudit[i];
  }
  
  // Shuffle slot pairings so BYEs are distributed across matchups
  // Group into pairs: (slot 0, slot 1), (slot 2, slot 3), etc.
  // We make sure no two BYEs are paired against each other
  const pairedSlots: [SeededTeam | null, SeededTeam | null][] = [];
  const numR1Matches = bracketSize / 2;

  // Distribute teams into pairs:
  // If registeredCount < bracketSize, we have `byesCount` = bracketSize - registeredCount.
  const byesCount = bracketSize - registeredCount;
  const teamList = [...seedAudit];
  
  for (let m = 0; m < numR1Matches; m++) {
    const teamA = teamList.shift() || null;
    let teamB: SeededTeam | null = null;
    
    // If we have remaining teams and need to fill slot B
    if (teamList.length > (numR1Matches - m - 1)) {
      teamB = teamList.shift() || null;
    } else if (teamList.length > 0 && Math.random() > 0.5) {
      teamB = teamList.shift() || null;
    }
    
    pairedSlots.push([teamA, teamB]);
  }

  // If any teams still remain in teamList, put them in remaining empty B slots
  for (let m = 0; m < numR1Matches && teamList.length > 0; m++) {
    if (!pairedSlots[m][1]) {
      pairedSlots[m][1] = teamList.shift() || null;
    }
  }

  const allMatches: Match[] = [];
  // Round-by-round match holders to wire nextMatchId
  const roundMatchesMap: Map<number, Match[]> = new Map();

  let matchCounter = 1;

  // Build match nodes from Round 1 to Final Round
  for (let r = 1; r <= totalRounds; r++) {
    const matchesInRound = bracketSize / Math.pow(2, r);
    const roundMatches: Match[] = [];

    for (let m = 0; m < matchesInRound; m++) {
      const matchId = uuidv4();
      let teamA: SeededTeam | null = null;
      let teamB: SeededTeam | null = null;
      let isBye = false;
      let winnerTeamId: string | null = null;
      let matchStatus: Match['matchStatus'] = 'WAITING_FOR_ROUND';

      if (r === 1) {
        const pair = pairedSlots[m];
        teamA = pair ? pair[0] : null;
        teamB = pair ? pair[1] : null;

        // Check if BYE match
        if (teamA && !teamB) {
          isBye = true;
          winnerTeamId = teamA.teamId;
          matchStatus = 'FINAL';
        } else if (!teamA && teamB) {
          isBye = true;
          winnerTeamId = teamB.teamId;
          matchStatus = 'FINAL';
        } else if (teamA && teamB) {
          isBye = false;
          matchStatus = 'WAITING_FOR_ROUND'; // Will open for ready check when tournament starts
        }
      }

      const matchObj: Match = {
        id: matchId,
        tournamentId,
        round: r,
        matchNumber: matchCounter++,
        bracketPosition: m,
        nextMatchId: null,
        nextMatchSlot: null,
        teamAId: teamA?.teamId || null,
        teamBId: teamB?.teamId || null,
        teamAName: teamA?.teamName || null,
        teamBName: teamB?.teamName || null,
        teamALogo: teamA?.teamLogo || null,
        teamBLogo: teamB?.teamLogo || null,
        winnerTeamId,
        loserTeamId: null,
        isBye,
        matchStatus,
        readyDeadlineAt: null,
        matchStartedAt: null,
        matchDeadlineAt: null,
        disputeDeadlineAt: null,
        intermissionDeadlineAt: null,
        finalScoreA: null,
        finalScoreB: null,
        teamAReady: false,
        teamBReady: false,
        createdAt: now,
        updatedAt: now
      };

      roundMatches.push(matchObj);
      allMatches.push(matchObj);
    }

    roundMatchesMap.set(r, roundMatches);
  }

  // Wire nextMatchId and slot ('A' or 'B') for each match
  for (let r = 1; r < totalRounds; r++) {
    const currentRoundMatches = roundMatchesMap.get(r) || [];
    const nextRoundMatches = roundMatchesMap.get(r + 1) || [];

    for (let m = 0; m < currentRoundMatches.length; m++) {
      const parentMatchIndex = Math.floor(m / 2);
      const nextMatch = nextRoundMatches[parentMatchIndex];
      const slot: 'A' | 'B' = m % 2 === 0 ? 'A' : 'B';

      currentRoundMatches[m].nextMatchId = nextMatch.id;
      currentRoundMatches[m].nextMatchSlot = slot;

      // If current match is already a resolved BYE in Round 1, populate into next round immediately
      if (currentRoundMatches[m].isBye && currentRoundMatches[m].winnerTeamId) {
        const winningTeamId = currentRoundMatches[m].winnerTeamId!;
        const winningTeamName = currentRoundMatches[m].teamAId === winningTeamId
          ? currentRoundMatches[m].teamAName
          : currentRoundMatches[m].teamBName;
        const winningLogo = currentRoundMatches[m].teamAId === winningTeamId
          ? currentRoundMatches[m].teamALogo
          : currentRoundMatches[m].teamBLogo;

        if (slot === 'A') {
          nextMatch.teamAId = winningTeamId;
          nextMatch.teamAName = winningTeamName;
          nextMatch.teamALogo = winningLogo;
        } else {
          nextMatch.teamBId = winningTeamId;
          nextMatch.teamBName = winningTeamName;
          nextMatch.teamBLogo = winningLogo;
        }

        // When both entrants of a later-round match become known through BYEs:
        // Set intermission and keep readyDeadlineAt null until intermission expires
        if (nextMatch.teamAId && nextMatch.teamBId && nextMatch.matchStatus === 'WAITING_FOR_ROUND') {
          const intermissionMs = (roundIntermissionMinutes || 10) * 60 * 1000;
          nextMatch.intermissionDeadlineAt = new Date(Date.now() + intermissionMs).toISOString();
          nextMatch.readyDeadlineAt = null;
          nextMatch.updatedAt = now;
        }
      }
    }
  }

  const seedsMap: Record<string, number> = {};
  seedAudit.forEach((s) => {
    seedsMap[s.teamId] = s.seed;
  });

  const bracket: Bracket = {
    id: bracketId,
    tournamentId,
    totalRounds,
    bracketSize,
    generatedAt: now,
    matches: allMatches,
    seeds: seedsMap
  };

  return {
    bracket,
    matches: allMatches,
    seedAudit
  };
}

/**
 * Checks whether a downstream match has materially started.
 * Downstream matches that have started playing, completed, or are in review cannot have their participants silently replaced.
 */
export function isDownstreamMatchMateriallyStarted(match: Match): boolean {
  const startedStatuses: Match['matchStatus'][] = [
    'ACTIVE',
    'RUN_1_PARTIAL',
    'RUN_1_COMPLETE',
    'RESULT_PENDING',
    'DISPUTED',
    'ADMIN_REVIEW',
    'FINAL',
    'FORFEIT',
    'DOUBLE_FORFEIT'
  ];

  if (startedStatuses.includes(match.matchStatus)) {
    return true;
  }
  if (match.matchStartedAt) {
    return true;
  }
  if (match.teamARun1 || match.teamBRun1 || match.teamARun2 || match.teamBRun2) {
    return true;
  }
  return false;
}

export interface AdvancementAuditEvent {
  action: 'MATCH_ADVANCED' | 'ADVANCEMENT_REVERSED' | 'ADVANCEMENT_CORRECTED';
  sourceMatchId: string;
  sourceRound: number;
  winnerTeamId?: string | null;
  previousWinnerTeamId?: string | null;
  newWinnerTeamId?: string | null;
  nextMatchId: string | null;
  nextMatchSlot: 'A' | 'B' | null;
  advancementReason?: string;
  reversalReason?: string;
  timestamp: string;
}

export interface ReconcileAdvancementResult {
  success: boolean;
  error?: string;
  updatedMatches: Match[];
  downstreamMatchId?: string | null;
  auditEvent?: AdvancementAuditEvent;
}

/**
 * Authoritative server-side reconciliation function for reversing or changing the winner
 * of an already-advanced match.
 */
export function reconcileMatchAdvancement(
  matches: Match[],
  sourceMatch: Match,
  previousWinnerTeamId: string | null,
  newWinnerTeamId: string | null,
  teamLookup: Record<string, { name: string; logoUrl?: string }>,
  roundIntermissionMinutes = 10,
  reason = 'Administrative reconciliation'
): ReconcileAdvancementResult {
  const nowIso = new Date().toISOString();

  // If this was the championship match (no nextMatchId)
  if (!sourceMatch.nextMatchId) {
    return {
      success: true,
      updatedMatches: matches,
      downstreamMatchId: null,
      auditEvent: {
        action: newWinnerTeamId ? 'ADVANCEMENT_CORRECTED' : 'ADVANCEMENT_REVERSED',
        sourceMatchId: sourceMatch.id,
        sourceRound: sourceMatch.round,
        previousWinnerTeamId,
        newWinnerTeamId,
        nextMatchId: null,
        nextMatchSlot: null,
        reversalReason: reason,
        timestamp: nowIso
      }
    };
  }

  const nextMatch = matches.find((m) => m.id === sourceMatch.nextMatchId);
  if (!nextMatch) {
    return {
      success: true,
      updatedMatches: matches,
      downstreamMatchId: null
    };
  }

  const slot = sourceMatch.nextMatchSlot;
  if (!slot) {
    return {
      success: false,
      error: `Source match ${sourceMatch.id} has nextMatchId but no nextMatchSlot.`,
      updatedMatches: matches
    };
  }

  // Reject if downstream match is already materially started
  if (isDownstreamMatchMateriallyStarted(nextMatch)) {
    return {
      success: false,
      error: `Cannot reverse or change winner: downstream match ${nextMatch.id} (Round ${nextMatch.round}) is already in progress (${nextMatch.matchStatus}). Explicit high-risk bracket rollback required.`,
      updatedMatches: matches,
      downstreamMatchId: nextMatch.id
    };
  }

  const currentSlotOccupant = slot === 'A' ? nextMatch.teamAId : nextMatch.teamBId;

  // Case 1: Winner cleared (e.g. reverse forfeit)
  if (!newWinnerTeamId) {
    // If the slot is already empty, treat the reversal as an idempotent safe no-op.
    if (!currentSlotOccupant) {
      return {
        success: true,
        updatedMatches: matches,
        downstreamMatchId: nextMatch.id,
        auditEvent: {
          action: 'ADVANCEMENT_REVERSED',
          sourceMatchId: sourceMatch.id,
          sourceRound: sourceMatch.round,
          previousWinnerTeamId,
          newWinnerTeamId: null,
          nextMatchId: nextMatch.id,
          nextMatchSlot: slot,
          reversalReason: `${reason} (Idempotent: downstream slot already empty)`,
          timestamp: nowIso
        }
      };
    }

    // If currentSlotOccupant is non-null and does not equal previousWinnerTeamId:
    // Return success: false and a bracket-integrity conflict error without clearing the unexpected occupant.
    if (currentSlotOccupant !== previousWinnerTeamId) {
      return {
        success: false,
        error: `Bracket integrity conflict: downstream slot ${slot} in match ${nextMatch.id} is occupied by team ${currentSlotOccupant}, not previous winner ${previousWinnerTeamId}. Reversal rejected.`,
        updatedMatches: matches,
        downstreamMatchId: nextMatch.id
      };
    }

    if (slot === 'A') {
      nextMatch.teamAId = null;
      nextMatch.teamAName = null;
      nextMatch.teamALogo = null;
      nextMatch.teamAReady = false;
      nextMatch.teamAReadyAt = null;
    } else {
      nextMatch.teamBId = null;
      nextMatch.teamBName = null;
      nextMatch.teamBLogo = null;
      nextMatch.teamBReady = false;
      nextMatch.teamBReadyAt = null;
    }

    // Downstream match is now missing a participant -> reset to WAITING_FOR_ROUND
    nextMatch.matchStatus = 'WAITING_FOR_ROUND';
    nextMatch.intermissionDeadlineAt = null;
    nextMatch.readyDeadlineAt = null;
    nextMatch.teamAReady = false;
    nextMatch.teamBReady = false;
    nextMatch.updatedAt = nowIso;

    return {
      success: true,
      updatedMatches: matches,
      downstreamMatchId: nextMatch.id,
      auditEvent: {
        action: 'ADVANCEMENT_REVERSED',
        sourceMatchId: sourceMatch.id,
        sourceRound: sourceMatch.round,
        previousWinnerTeamId,
        newWinnerTeamId: null,
        nextMatchId: nextMatch.id,
        nextMatchSlot: slot,
        reversalReason: reason,
        timestamp: nowIso
      }
    };
  }

  // Case 2: Winner changed
  // Bracket integrity conflict check:
  if (currentSlotOccupant && currentSlotOccupant !== previousWinnerTeamId && currentSlotOccupant !== newWinnerTeamId) {
    return {
      success: false,
      error: `Bracket integrity conflict: downstream slot ${slot} in match ${nextMatch.id} is occupied by team ${currentSlotOccupant}, not previous winner ${previousWinnerTeamId}.`,
      updatedMatches: matches,
      downstreamMatchId: nextMatch.id
    };
  }

  const winnerInfo = teamLookup[newWinnerTeamId] || {
    name: sourceMatch.teamAId === newWinnerTeamId ? (sourceMatch.teamAName || 'Winner') : (sourceMatch.teamBName || 'Winner')
  };

  if (slot === 'A') {
    nextMatch.teamAId = newWinnerTeamId;
    nextMatch.teamAName = winnerInfo.name;
    nextMatch.teamALogo = winnerInfo.logoUrl || null;
    nextMatch.teamAReady = false;
    nextMatch.teamAReadyAt = null;
  } else {
    nextMatch.teamBId = newWinnerTeamId;
    nextMatch.teamBName = winnerInfo.name;
    nextMatch.teamBLogo = winnerInfo.logoUrl || null;
    nextMatch.teamBReady = false;
    nextMatch.teamBReadyAt = null;
  }

  // If both slots now populated, enter intermission (do NOT set ready deadline yet)
  if (nextMatch.teamAId && nextMatch.teamBId) {
    nextMatch.matchStatus = 'WAITING_FOR_ROUND';
    const intermissionMs = (roundIntermissionMinutes || 10) * 60 * 1000;
    nextMatch.intermissionDeadlineAt = new Date(Date.now() + intermissionMs).toISOString();
    nextMatch.readyDeadlineAt = null;
    nextMatch.teamAReady = false;
    nextMatch.teamBReady = false;
  } else {
    nextMatch.matchStatus = 'WAITING_FOR_ROUND';
    nextMatch.intermissionDeadlineAt = null;
    nextMatch.readyDeadlineAt = null;
  }

  nextMatch.updatedAt = nowIso;

  return {
    success: true,
    updatedMatches: matches,
    downstreamMatchId: nextMatch.id,
    auditEvent: {
      action: 'ADVANCEMENT_CORRECTED',
      sourceMatchId: sourceMatch.id,
      sourceRound: sourceMatch.round,
      previousWinnerTeamId,
      newWinnerTeamId,
      nextMatchId: nextMatch.id,
      nextMatchSlot: slot,
      reversalReason: reason,
      timestamp: nowIso
    }
  };
}

export interface AdvanceMatchWinnerResult {
  success: boolean;
  error?: string;
  updatedMatches: Match[];
  advancedToMatchId: string | null;
  isTournamentComplete: boolean;
  championTeamId: string | null;
  auditEvent?: AdvancementAuditEvent;
}

/**
 * Authoritatively advances match winner forward into the next round match.
 * Enforces idempotency, bracket integrity validation, intermission setup, and audit events.
 */
export function advanceMatchWinner(
  matches: Match[],
  completedMatchId: string,
  winnerTeamId: string,
  teamLookup: Record<string, { name: string; logoUrl?: string }>,
  roundIntermissionMinutes = 10,
  advancementReason = 'Match finalized'
): AdvanceMatchWinnerResult {
  const matchIndex = matches.findIndex((m) => m.id === completedMatchId);
  if (matchIndex === -1) {
    return {
      success: false,
      error: `Match with ID ${completedMatchId} not found.`,
      updatedMatches: matches,
      advancedToMatchId: null,
      isTournamentComplete: false,
      championTeamId: null
    };
  }

  const completedMatch = matches[matchIndex];
  const nowIso = new Date().toISOString();

  // Validate that winnerTeamId is actually one of the match participants
  if (completedMatch.teamAId !== winnerTeamId && completedMatch.teamBId !== winnerTeamId) {
    return {
      success: false,
      error: `Team ${winnerTeamId} is not a participant in match ${completedMatchId} (Team A: ${completedMatch.teamAId}, Team B: ${completedMatch.teamBId}).`,
      updatedMatches: matches,
      advancedToMatchId: null,
      isTournamentComplete: false,
      championTeamId: null
    };
  }

  // Idempotency check:
  // If already final or forfeit with this winner
  if ((completedMatch.matchStatus === 'FINAL' || completedMatch.matchStatus === 'FORFEIT') && completedMatch.winnerTeamId === winnerTeamId) {
    if (!completedMatch.nextMatchId) {
      return {
        success: true,
        updatedMatches: matches,
        advancedToMatchId: null,
        isTournamentComplete: true,
        championTeamId: winnerTeamId
      };
    }
    const nextMatch = matches.find((m) => m.id === completedMatch.nextMatchId);
    if (nextMatch) {
      const currentSlot = completedMatch.nextMatchSlot === 'A' ? nextMatch.teamAId : nextMatch.teamBId;
      if (currentSlot === winnerTeamId) {
        // Idempotent call: already advanced to this slot!
        return {
          success: true,
          updatedMatches: matches,
          advancedToMatchId: nextMatch.id,
          isTournamentComplete: false,
          championTeamId: null
        };
      }
    }
  }

  // Championship match (no nextMatchId)
  if (!completedMatch.nextMatchId) {
    completedMatch.winnerTeamId = winnerTeamId;
    completedMatch.loserTeamId = completedMatch.teamAId === winnerTeamId ? completedMatch.teamBId : completedMatch.teamAId;
    if (completedMatch.matchStatus !== 'FORFEIT') {
      completedMatch.matchStatus = 'FINAL';
    }
    completedMatch.updatedAt = nowIso;

    return {
      success: true,
      updatedMatches: matches,
      advancedToMatchId: null,
      isTournamentComplete: true,
      championTeamId: winnerTeamId,
      auditEvent: {
        action: 'MATCH_ADVANCED',
        sourceMatchId: completedMatch.id,
        sourceRound: completedMatch.round,
        winnerTeamId,
        nextMatchId: null,
        nextMatchSlot: null,
        advancementReason: `${advancementReason} (Championship Final)`,
        timestamp: nowIso
      }
    };
  }

  const nextMatch = matches.find((m) => m.id === completedMatch.nextMatchId);
  if (!nextMatch) {
    return {
      success: false,
      error: `Downstream match ${completedMatch.nextMatchId} not found.`,
      updatedMatches: matches,
      advancedToMatchId: null,
      isTournamentComplete: false,
      championTeamId: null
    };
  }

  const slot = completedMatch.nextMatchSlot;
  if (!slot) {
    return {
      success: false,
      error: `Match ${completedMatch.id} does not have nextMatchSlot specified.`,
      updatedMatches: matches,
      advancedToMatchId: null,
      isTournamentComplete: false,
      championTeamId: null
    };
  }

  // Bracket integrity check:
  // If slot in downstream match is occupied by a DIFFERENT team (not null and not winnerTeamId),
  // reject rather than silently overwriting!
  const existingSlotTeamId = slot === 'A' ? nextMatch.teamAId : nextMatch.teamBId;
  if (existingSlotTeamId && existingSlotTeamId !== winnerTeamId && existingSlotTeamId !== completedMatch.winnerTeamId) {
    return {
      success: false,
      error: `Bracket integrity conflict: downstream slot ${slot} in match ${nextMatch.id} is already occupied by team ${existingSlotTeamId}.`,
      updatedMatches: matches,
      advancedToMatchId: null,
      isTournamentComplete: false,
      championTeamId: null
    };
  }

  // Reject if downstream match is materially started with an old team
  if (existingSlotTeamId !== winnerTeamId && isDownstreamMatchMateriallyStarted(nextMatch)) {
    return {
      success: false,
      error: `Cannot advance team: downstream match ${nextMatch.id} is already in progress (${nextMatch.matchStatus}). Explicit high-risk bracket rollback required.`,
      updatedMatches: matches,
      advancedToMatchId: null,
      isTournamentComplete: false,
      championTeamId: null
    };
  }

  // Authoritatively update source match
  completedMatch.winnerTeamId = winnerTeamId;
  completedMatch.loserTeamId = completedMatch.teamAId === winnerTeamId ? completedMatch.teamBId : completedMatch.teamAId;
  if (completedMatch.matchStatus !== 'FORFEIT') {
    completedMatch.matchStatus = 'FINAL';
  }
  completedMatch.updatedAt = nowIso;

  // Propagate to downstream match
  const winnerInfo = teamLookup[winnerTeamId] || {
    name: completedMatch.teamAId === winnerTeamId ? (completedMatch.teamAName || 'Winner') : (completedMatch.teamBName || 'Winner')
  };

  if (slot === 'A') {
    nextMatch.teamAId = winnerTeamId;
    nextMatch.teamAName = winnerInfo.name;
    nextMatch.teamALogo = winnerInfo.logoUrl || null;
    nextMatch.teamAReady = false;
    nextMatch.teamAReadyAt = null;
  } else {
    nextMatch.teamBId = winnerTeamId;
    nextMatch.teamBName = winnerInfo.name;
    nextMatch.teamBLogo = winnerInfo.logoUrl || null;
    nextMatch.teamBReady = false;
    nextMatch.teamBReadyAt = null;
  }

  // If next match now has both teams, enter round intermission
  // Do NOT set readyDeadlineAt until intermission actually expires!
  if (nextMatch.teamAId && nextMatch.teamBId && nextMatch.matchStatus === 'WAITING_FOR_ROUND') {
    const intermissionMs = (roundIntermissionMinutes || 10) * 60 * 1000;
    nextMatch.intermissionDeadlineAt = new Date(Date.now() + intermissionMs).toISOString();
    nextMatch.readyDeadlineAt = null; // Stays null during intermission
    nextMatch.teamAReady = false;
    nextMatch.teamBReady = false;
  }

  nextMatch.updatedAt = nowIso;

  return {
    success: true,
    updatedMatches: matches,
    advancedToMatchId: nextMatch.id,
    isTournamentComplete: false,
    championTeamId: null,
    auditEvent: {
      action: 'MATCH_ADVANCED',
      sourceMatchId: completedMatch.id,
      sourceRound: completedMatch.round,
      winnerTeamId,
      nextMatchId: nextMatch.id,
      nextMatchSlot: slot,
      advancementReason,
      timestamp: nowIso
    }
  };
}

/**
 * Authoritatively calculates the tournament's current round based on bracket progression.
 * Returns the highest round with an active, ready, or pending match, or the final round if completed.
 */
export function calculateTournamentCurrentRound(matches: Match[], defaultRound = 1): number {
  const inProgressStatuses: Match['matchStatus'][] = [
    'READY_CHECK',
    'ACTIVE',
    'RUN_1_PARTIAL',
    'RUN_1_COMPLETE',
    'RESULT_PENDING',
    'DISPUTED',
    'ADMIN_REVIEW'
  ];

  const activeMatches = matches.filter((m) => {
    if (m.isBye) return false;
    if (inProgressStatuses.includes(m.matchStatus)) return true;
    // Populated WAITING_FOR_ROUND matches in intermission
    if (m.matchStatus === 'WAITING_FOR_ROUND' && m.teamAId && m.teamBId) return true;
    return false;
  });

  if (activeMatches.length > 0) {
    return Math.max(...activeMatches.map((m) => m.round));
  }

  // If no live matches, check if tournament is completely finished
  const nonByeMatches = matches.filter((m) => !m.isBye);
  if (nonByeMatches.length > 0) {
    const allDone = nonByeMatches.every((m) =>
      ['FINAL', 'FORFEIT', 'DOUBLE_FORFEIT', 'CANCELLED'].includes(m.matchStatus)
    );
    if (allDone) {
      return Math.max(...nonByeMatches.map((m) => m.round));
    }
  }

  return defaultRound;
}

