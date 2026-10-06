import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { calculateRunScore, validateScoreInputs } from './scoring';
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
  statusCode?: number;
  error?: string;
  submission?: RunSubmission;
  match?: Match;
  message?: string;
}

/**
 * Authoritative score submission service used by BOTH the GUI endpoint and `/score` chat command.
 * Enforces strict run sequencing, match state validation, immutability, captain-only authorization,
 * tournament objective configuration, and phase transitions.
 */
export function submitScoreAuthoritative(input: ScoreSubmissionInput): ScoreSubmissionResult {
  const { matchId, user, evidenceUrl } = input;

  // 1. Strict Score Input Validation (rejects non-numeric, floats for integers, non-booleans, negative values)
  const validation = validateScoreInputs({
    runNumber: input.runNumber,
    runnerKills: input.runnerKills,
    extractedCredits: input.extractedCredits,
    playersExtracted: input.playersExtracted,
    objectiveCompleted: input.objectiveCompleted
  });
  if (!validation.valid) {
    return { success: false, statusCode: 400, error: validation.error };
  }

  const runNum = input.runNumber as 1 | 2;

  const match = db.data.matches.find((m) => m.id === matchId);
  if (!match) {
    return { success: false, statusCode: 404, error: 'Match not found.' };
  }

  // 2. Match State Validation
  const validScoringStates = ['ACTIVE', 'RUN_1_PARTIAL', 'RUN_1_COMPLETE'];
  if (!validScoringStates.includes(match.matchStatus)) {
    return {
      success: false,
      statusCode: 400,
      error: `Score submissions are not permitted while match is in '${match.matchStatus}' state. Match must be in an active scoring phase.`
    };
  }

  // 3. Captain-Only Authorization Policy
  // Only the designated captain of Team A or Team B may submit official scores.
  // Ordinary roster members are rejected with 403.
  // Administrators must use audited score correction/override tools.
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
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (isAdmin) {
    return {
      success: false,
      statusCode: 403,
      error: 'Administrators must use audited admin score correction/override tools rather than the player score endpoint.'
    };
  }

  if (!isCaptainA && !isCaptainB) {
    return {
      success: false,
      statusCode: 403,
      error: 'Only designated Team Captains may submit official scores for their team.'
    };
  }

  // Determine target team for captain
  let targetTeamId = input.teamId;
  if (!targetTeamId) {
    if (isCaptainA && !isCaptainB) {
      targetTeamId = match.teamAId!;
    } else if (isCaptainB && !isCaptainA) {
      targetTeamId = match.teamBId!;
    } else {
      return { success: false, statusCode: 400, error: 'Target teamId must be explicitly specified.' };
    }
  }

  // Captains may only submit for their own team
  if (isCaptainA && !isCaptainB && targetTeamId !== match.teamAId) {
    return { success: false, statusCode: 403, error: 'Captains may only submit scores for their own team.' };
  }
  if (isCaptainB && !isCaptainA && targetTeamId !== match.teamBId) {
    return { success: false, statusCode: 403, error: 'Captains may only submit scores for their own team.' };
  }

  const isSlotA = targetTeamId === match.teamAId;
  const isSlotB = targetTeamId === match.teamBId;

  if (!isSlotA && !isSlotB) {
    return { success: false, statusCode: 400, error: `Invalid target team ID '${targetTeamId}'. Must be one of the match participants.` };
  }

  const targetTeamName = isSlotA ? (match.teamAName || 'Team A') : (match.teamBName || 'Team B');

  // 4. Duplicate / Immutability Validation
  if (runNum === 1) {
    if ((isSlotA && match.teamARun1) || (isSlotB && match.teamBRun1)) {
      return {
        success: false,
        statusCode: 400,
        error: `Run 1 score for ${targetTeamName} is already locked and immutable. Corrections require an audited administrator score correction.`
      };
    }
  }

  if (runNum === 2) {
    if ((isSlotA && match.teamARun2) || (isSlotB && match.teamBRun2)) {
      return {
        success: false,
        statusCode: 400,
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
        statusCode: 400,
        error: 'Run 2 cannot be submitted until BOTH teams have submitted Run 1 and Run 1 scores have been authoritatively revealed.'
      };
    }
  }

  // 6. Tournament Objective Configuration & Run Score Calculation (NO COERCION)
  const tournament = db.data.tournaments.find((t) => t.id === match.tournamentId);
  const featuredObjectivePoints = tournament?.featuredObjectivePoints ?? 5;

  const calculated = calculateRunScore({
    runnerKills: input.runnerKills,
    extractedCredits: input.extractedCredits,
    playersExtracted: input.playersExtracted as 0 | 1 | 2 | 3,
    objectiveCompleted: input.objectiveCompleted,
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
