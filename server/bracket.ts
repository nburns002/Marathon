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
  teamLookup: Record<string, { name: string; logoUrl?: string }>
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
      }
    }
  }

  const bracket: Bracket = {
    id: bracketId,
    tournamentId,
    totalRounds,
    bracketSize,
    generatedAt: now,
    matches: allMatches
  };

  return {
    bracket,
    matches: allMatches,
    seedAudit
  };
}

/**
 * Propagates match winner forward into the next round match.
 */
export function advanceMatchWinner(
  matches: Match[],
  completedMatchId: string,
  winnerTeamId: string,
  teamLookup: Record<string, { name: string; logoUrl?: string }>,
  roundIntermissionMinutes = 10
): {
  updatedMatches: Match[];
  advancedToMatchId: string | null;
  isTournamentComplete: boolean;
  championTeamId: string | null;
} {
  const matchIndex = matches.findIndex((m) => m.id === completedMatchId);
  if (matchIndex === -1) {
    return { updatedMatches: matches, advancedToMatchId: null, isTournamentComplete: false, championTeamId: null };
  }

  const completedMatch = matches[matchIndex];
  completedMatch.winnerTeamId = winnerTeamId;
  completedMatch.loserTeamId = completedMatch.teamAId === winnerTeamId ? completedMatch.teamBId : completedMatch.teamAId;
  completedMatch.matchStatus = 'FINAL';
  completedMatch.updatedAt = new Date().toISOString();

  // If this was the championship match (no nextMatchId)
  if (!completedMatch.nextMatchId) {
    return {
      updatedMatches: matches,
      advancedToMatchId: null,
      isTournamentComplete: true,
      championTeamId: winnerTeamId
    };
  }

  const nextMatchIndex = matches.findIndex((m) => m.id === completedMatch.nextMatchId);
  if (nextMatchIndex === -1) {
    return { updatedMatches: matches, advancedToMatchId: null, isTournamentComplete: false, championTeamId: null };
  }

  const nextMatch = matches[nextMatchIndex];
  const winnerInfo = teamLookup[winnerTeamId] || {
    name: completedMatch.teamAId === winnerTeamId ? (completedMatch.teamAName || 'Winner') : (completedMatch.teamBName || 'Winner')
  };

  if (completedMatch.nextMatchSlot === 'A') {
    nextMatch.teamAId = winnerTeamId;
    nextMatch.teamAName = winnerInfo.name;
    nextMatch.teamALogo = winnerInfo.logoUrl || null;
  } else {
    nextMatch.teamBId = winnerTeamId;
    nextMatch.teamBName = winnerInfo.name;
    nextMatch.teamBLogo = winnerInfo.logoUrl || null;
  }

  // If next match now has both teams, set intermission or ready check
  if (nextMatch.teamAId && nextMatch.teamBId && nextMatch.matchStatus === 'WAITING_FOR_ROUND') {
    const nowMs = Date.now();
    const intermissionMs = (roundIntermissionMinutes || 10) * 60 * 1000;
    nextMatch.intermissionDeadlineAt = new Date(nowMs + intermissionMs).toISOString();
    nextMatch.readyDeadlineAt = new Date(nowMs + intermissionMs + 10 * 60 * 1000).toISOString();
    nextMatch.updatedAt = new Date().toISOString();
  }

  return {
    updatedMatches: matches,
    advancedToMatchId: nextMatch.id,
    isTournamentComplete: false,
    championTeamId: null
  };
}
