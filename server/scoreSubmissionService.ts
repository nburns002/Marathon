import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { calculateRunScore } from './scoring';
import { broadcastEvent } from './timerWorker';
import { Match, RunSubmission, User } from '../src/types';

export interface ScoreSubmissionInput {
  matchId: string;
  user: User;
  teamId?: string;
  runNumber: number;
  runnerKills: number;
  extractedCredits: number;
  playersExtracted: number;
  objectiveCompleted: boolean;
  evidenceUrl?: string;
  isChatCommand?: boolean;
}

export interface ScoreSubmissionResult {
  success: boolean;
  error?: string;
  submission?: RunSubmission;
  match?: Match;
  message?: string;
}

/**
 * Authoritative score submission service used by BOTH the GUI endpoint and `/score` chat command.
 * Enforces strict run sequencing, match state validation, immutability, participant authorization,
 * tournament objective configuration, and phase transitions.
 */
export function submitScoreAuthoritative(input: ScoreSubmissionInput): ScoreSubmissionResult {
  const { matchId, user, runNumber, evidenceUrl, isChatCommand } = input;

  const match = db.data.matches.find((m) => m.id === matchId);
  if (!match) {
    return { success: false, error: 'Match not found.' };
  }

  // 1. Match State Validation
  const validScoringStates = ['ACTIVE', 'RUN_1_PARTIAL', 'RUN_1_COMPLETE'];
  if (!validScoringStates.includes(match.matchStatus)) {
    return {
      success: false,
      error: `Score submissions are not permitted while match is in '${match.matchStatus}' state. Match must be in an active scoring phase.`
    };
  }

  // 2. Run Number Validation (strictly 1 or 2)
  if (runNumber !== 1 && runNumber !== 2) {
    return { success: false, error: 'Run number must be exactly 1 or 2.' };
  }
  const runNum = runNumber as 1 | 2;

  // 3. Participant Authorization & Target Team Validation
  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const teamB = match.teamBId ? db.data.teams.find((t) => t.id === match.teamBId) : null;

  const regA = match.teamAId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamAId)
    : null;
  const regB = match.teamBId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamBId)
    : null;

  const isCaptainA = teamA?.captainUserId === user.id || regA?.captainUserId === user.id;
  const isCaptainB = teamB?.captainUserId === user.id || regB?.captainUserId === user.id;

  const isRosterA =
    isCaptainA ||
    (regA?.rosterSnapshot && regA.rosterSnapshot.some((r) => r.userId === user.id)) ||
    (match.teamAId ? db.data.teamMembers.some((m) => m.teamId === match.teamAId && m.userId === user.id) : false);

  const isRosterB =
    isCaptainB ||
    (regB?.rosterSnapshot && regB.rosterSnapshot.some((r) => r.userId === user.id)) ||
    (match.teamBId ? db.data.teamMembers.some((m) => m.teamId === match.teamBId && m.userId === user.id) : false);

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isRosterA && !isRosterB && !isAdmin) {
    return { success: false, error: 'You are not a confirmed participant in this match.' };
  }

  if (isChatCommand && !isCaptainA && !isCaptainB && !isAdmin) {
    return { success: false, error: 'Only the designated Team Captain may submit scores using the /score command.' };
  }

  // Determine target team
  let targetTeamId = input.teamId;
  if (!targetTeamId) {
    if (isRosterA && !isRosterB) {
      targetTeamId = match.teamAId!;
    } else if (isRosterB && !isRosterA) {
      targetTeamId = match.teamBId!;
    } else if (isCaptainA) {
      targetTeamId = match.teamAId!;
    } else if (isCaptainB) {
      targetTeamId = match.teamBId!;
    } else {
      return { success: false, error: 'Target teamId must be explicitly specified.' };
    }
  }

  // Verify user belongs to the target team (cannot submit for opponent)
  if (!isAdmin) {
    if (targetTeamId === match.teamAId && !isRosterA) {
      return { success: false, error: 'You cannot submit scores for Team A.' };
    }
    if (targetTeamId === match.teamBId && !isRosterB) {
      return { success: false, error: 'You cannot submit scores for Team B.' };
    }
  }

  const isSlotA = targetTeamId === match.teamAId;
  const isSlotB = targetTeamId === match.teamBId;

  if (!isSlotA && !isSlotB) {
    return { success: false, error: `Invalid target team ID '${targetTeamId}'. Must be one of the match participants.` };
  }

  const targetTeamName = isSlotA ? (match.teamAName || 'Team A') : (match.teamBName || 'Team B');

  // 4. Duplicate / Immutability Validation
  if (runNum === 1) {
    if ((isSlotA && match.teamARun1) || (isSlotB && match.teamBRun1)) {
      return {
        success: false,
        error: `Run 1 score for ${targetTeamName} is already locked and immutable. Corrections require an audited administrator score correction.`
      };
    }
  }

  if (runNum === 2) {
    if ((isSlotA && match.teamARun2) || (isSlotB && match.teamBRun2)) {
      return {
        success: false,
        error: `Run 2 score for ${targetTeamName} is already locked and immutable. Corrections require an audited administrator score correction.`
      };
    }
  }

  // 5. Strict Run Sequencing:
  // Run 2 may NOT be submitted until BOTH teams have submitted Run 1 and Run 1 has been authoritatively revealed.
  if (runNum === 2) {
    if (!match.teamARun1 || !match.teamBRun1 || !match.run1Revealed) {
      return {
        success: false,
        error: 'Run 2 cannot be submitted until BOTH teams have submitted Run 1 and Run 1 scores have been authoritatively revealed.'
      };
    }
  }

  // 6. Strict Numeric Validation
  const runnerKills = Math.floor(Number(input.runnerKills));
  const extractedCredits = Number(input.extractedCredits);
  const playersExtracted = Math.floor(Number(input.playersExtracted));
  const objectiveCompleted = Boolean(input.objectiveCompleted);

  if (isNaN(runnerKills) || runnerKills < 0) {
    return { success: false, error: 'Runner kills must be a non-negative integer.' };
  }
  if (isNaN(extractedCredits) || extractedCredits < 0) {
    return { success: false, error: 'Extracted credits must be a non-negative number.' };
  }
  if (![0, 1, 2, 3].includes(playersExtracted)) {
    return { success: false, error: 'Players extracted must be an integer between 0 and 3.' };
  }

  // 7. Tournament Objective Configuration & Run Score Calculation
  const tournament = db.data.tournaments.find((t) => t.id === match.tournamentId);
  const featuredObjectivePoints = tournament?.featuredObjectivePoints ?? 5;

  const calculated = calculateRunScore({
    runnerKills,
    extractedCredits,
    playersExtracted: playersExtracted as 0 | 1 | 2 | 3,
    objectiveCompleted,
    objectivePointsValue: featuredObjectivePoints
  });

  const isoNow = new Date().toISOString();
  const submission: RunSubmission = {
    id: `sub-${uuidv4().slice(0, 8)}`,
    matchId: match.id,
    teamId: targetTeamId,
    runNumber: runNum,
    ...calculated,
    submittedBy: user.id,
    submittedByName: user.displayName || user.username,
    submittedAt: isoNow,
    evidenceUrl: evidenceUrl?.trim() || undefined,
    locked: true
  };

  db.data.runSubmissions.push(submission);

  if (isSlotA) {
    if (runNum === 1) match.teamARun1 = submission;
    else match.teamARun2 = submission;
  } else {
    if (runNum === 1) match.teamBRun1 = submission;
    else match.teamBRun2 = submission;
  }

  // 8. System Messages and Phase Transitions
  if (runNum === 1) {
    // Check if other team has submitted Run 1
    const bothRun1Submitted = Boolean(match.teamARun1 && match.teamBRun1);

    if (!bothRun1Submitted) {
      match.matchStatus = 'RUN_1_PARTIAL';
      match.run1Revealed = false;

      // Notice: Match message created here contains structuredScore,
      // but serializeMessagesForViewer will sanitize it for opponent & spectators!
      db.data.matchMessages.push({
        id: uuidv4(),
        matchId: match.id,
        userId: 'SYSTEM',
        userName: 'SYSTEM',
        userRole: 'SYSTEM',
        teamId: targetTeamId,
        teamName: targetTeamName,
        type: 'SCORE_SUBMISSION',
        message: `SYSTEM — RUN 1 SUBMITTED BY ${targetTeamName}\n${calculated.breakdownString}`,
        structuredScore: submission,
        createdAt: isoNow
      });
    } else {
      // Both teams have submitted Run 1! Reveal both!
      match.matchStatus = 'RUN_1_COMPLETE';
      match.run1Revealed = true;

      // Post submission message for second submitter
      db.data.matchMessages.push({
        id: uuidv4(),
        matchId: match.id,
        userId: 'SYSTEM',
        userName: 'SYSTEM',
        userRole: 'SYSTEM',
        teamId: targetTeamId,
        teamName: targetTeamName,
        type: 'SCORE_SUBMISSION',
        message: `SYSTEM — RUN 1 SUBMITTED BY ${targetTeamName}\n${calculated.breakdownString}`,
        structuredScore: submission,
        createdAt: isoNow
      });

      const scoreA1 = match.teamARun1!.finalRunScore;
      const scoreB1 = match.teamBRun1!.finalRunScore;
      const diff = Math.abs(scoreA1 - scoreB1);
      const leader = scoreA1 >= scoreB1 ? match.teamAName : match.teamBName;
      const trailer = scoreA1 < scoreB1 ? match.teamAName : match.teamBName;

      db.data.matchMessages.push({
        id: uuidv4(),
        matchId: match.id,
        userId: 'SYSTEM',
        userName: 'SYSTEM',
        userRole: 'SYSTEM',
        type: 'SYSTEM',
        message: `SYSTEM — BOTH RUN 1 SCORES LOCKED AND REVEALED!\n${match.teamAName}: ${scoreA1.toFixed(2)} pts\n${match.teamBName}: ${scoreB1.toFixed(2)} pts\n${scoreA1 === scoreB1 ? 'Tied after Run 1!' : `${trailer} trails ${leader} by ${diff.toFixed(2)} pts heading into Run 2.`}`,
        createdAt: isoNow
      });
    }
  } else if (runNum === 2) {
    // Post submission message for Run 2
    db.data.matchMessages.push({
      id: uuidv4(),
      matchId: match.id,
      userId: 'SYSTEM',
      userName: 'SYSTEM',
      userRole: 'SYSTEM',
      teamId: targetTeamId,
      teamName: targetTeamName,
      type: 'SCORE_SUBMISSION',
      message: `SYSTEM — RUN 2 SUBMITTED BY ${targetTeamName}\n${calculated.breakdownString}`,
      structuredScore: submission,
      createdAt: isoNow
    });

    const bothRun2Submitted = Boolean(match.teamARun2 && match.teamBRun2);
    if (bothRun2Submitted) {
      match.matchStatus = 'RESULT_PENDING';
      match.run1Revealed = true;

      const disputeMinutes = tournament?.disputeWindowMinutes || 10;
      match.disputeDeadlineAt = new Date(Date.now() + disputeMinutes * 60 * 1000).toISOString();

      match.finalScoreA = Number(((match.teamARun1?.finalRunScore || 0) + (match.teamARun2?.finalRunScore || 0)).toFixed(2));
      match.finalScoreB = Number(((match.teamBRun1?.finalRunScore || 0) + (match.teamBRun2?.finalRunScore || 0)).toFixed(2));

      const provWinner = match.finalScoreA >= match.finalScoreB ? match.teamAName : match.teamBName;

      db.data.matchMessages.push({
        id: uuidv4(),
        matchId: match.id,
        userId: 'SYSTEM',
        userName: 'SYSTEM',
        userRole: 'SYSTEM',
        type: 'SYSTEM',
        message: `SYSTEM — ALL RUNS COMPLETED. PROVISIONAL RESULT:\n${match.teamAName}: ${match.finalScoreA.toFixed(2)} pts\n${match.teamBName}: ${match.finalScoreB.toFixed(2)} pts\nProvisional Winner: ${provWinner}\n${disputeMinutes}-Minute Result Review Window started. Finalizes automatically if no dispute is raised.`,
        createdAt: isoNow
      });
    }
  }

  match.updatedAt = isoNow;
  db.save();
  broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });

  return {
    success: true,
    submission,
    match,
    message: `Run ${runNum} submitted and locked successfully.`
  };
}
