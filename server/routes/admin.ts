import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, requireAdmin } from '../middleware';
import { calculateRunScore, determineMatchWinner, validateScoreInputs } from '../scoring';
import { advanceMatchWinner, reconcileMatchAdvancement, calculateTournamentCurrentRound } from '../bracket';
import { AdminAction, AuditLog } from '../../src/types';
import { broadcastEvent } from '../timerWorker';

const router = Router();

// Admin Dashboard Summary Metrics
router.get('/dashboard', requireAuth, requireAdmin, (req, res) => {
  const tournaments = db.data.tournaments;
  const liveTournaments = tournaments.filter((t) => t.status === 'LIVE');
  const activeMatches = db.data.matches.filter(
    (m) => m.matchStatus === 'ACTIVE' || m.matchStatus === 'READY_CHECK' || m.matchStatus === 'RUN_1_PARTIAL' || m.matchStatus === 'RUN_1_COMPLETE'
  );
  const pendingReviewMatches = db.data.matches.filter((m) => m.matchStatus === 'RESULT_PENDING');
  const disputedMatches = db.data.matches.filter((m) => m.matchStatus === 'DISPUTED' || m.matchStatus === 'ADMIN_REVIEW');
  const openDisputes = db.data.matchDisputes.filter((d) => d.status === 'OPEN' || d.status === 'INVESTIGATING');
  const openTickets = db.data.adminTickets.filter((t) => t.status === 'OPEN' || t.status === 'CLAIMED' || t.status === 'INVESTIGATING');

  const totalRegisteredTeams = db.data.tournamentRegistrations.filter((r) => r.status === 'REGISTERED' && r.paymentStatus === 'PAID').length;

  return res.json({
    metrics: {
      totalTournaments: tournaments.length,
      liveTournaments: liveTournaments.length,
      activeMatches: activeMatches.length,
      pendingReviewMatches: pendingReviewMatches.length,
      disputedMatches: disputedMatches.length,
      openDisputesCount: openDisputes.length,
      openTicketsCount: openTickets.length,
      totalRegisteredTeams,
      activePlayersCount: db.data.users.length
    },
    openDisputes,
    openTickets,
    disputedMatches,
    recentAdminActions: db.data.adminActions.slice(-15).reverse(),
    recentAuditLogs: db.data.auditLogs.slice(-25).reverse()
  });
});

// Get Dispute Queue
router.get('/disputes', requireAuth, requireAdmin, (req, res) => {
  const disputes = db.data.matchDisputes.map((d) => {
    const match = db.data.matches.find((m) => m.id === d.matchId);
    return {
      ...d,
      match
    };
  });
  return res.json({ disputes });
});

// Authoritative Shared Admin Score Correction Function
function applyAuthoritativeAdminScoreCorrection(params: {
  match: any;
  admin: any;
  teamId: string;
  runNumber: any;
  runnerKills: any;
  extractedCredits: any;
  playersExtracted: any;
  objectiveCompleted: any;
  reason: string;
}): { success: boolean; error?: string; oldScoreStr?: string; newScoreStr?: string } {
  const { match, admin, teamId, runNumber, runnerKills, extractedCredits, playersExtracted, objectiveCompleted, reason } = params;

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return { success: false, error: 'A mandatory written reason is required for score overrides.' };
  }

  // 1. teamId must exactly equal match.teamAId or match.teamBId
  if (!teamId || (teamId !== match.teamAId && teamId !== match.teamBId)) {
    return {
      success: false,
      error: `Invalid teamId '${teamId}'. Must exactly equal match participant Team A (${match.teamAId}) or Team B (${match.teamBId}).`
    };
  }

  // 2. Strict Score Input Validation (NO permissive coercion, NO Math.floor(), NO Boolean())
  const validation = validateScoreInputs({
    runNumber,
    runnerKills,
    extractedCredits,
    playersExtracted,
    objectiveCompleted
  });
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const runNum = runNumber as 1 | 2;

  // 3. The targeted RunSubmission must exist before an override is accepted
  const isSlotA = teamId === match.teamAId;
  const targetSub = isSlotA
    ? (runNum === 1 ? match.teamARun1 : match.teamARun2)
    : (runNum === 1 ? match.teamBRun1 : match.teamBRun2);

  if (!targetSub) {
    const teamName = isSlotA ? (match.teamAName || 'Team A') : (match.teamBName || 'Team B');
    return {
      success: false,
      error: `Cannot override score: Run ${runNum} for ${teamName} does not exist.`
    };
  }

  const tournament = db.data.tournaments.find((t) => t.id === match.tournamentId);
  const calculated = calculateRunScore({
    runnerKills,
    extractedCredits,
    playersExtracted: playersExtracted as 0 | 1 | 2 | 3,
    objectiveCompleted,
    objectivePointsValue: tournament?.featuredObjectivePoints || 5
  });

  const isoNow = new Date().toISOString();
  const oldScoreStr = targetSub ? `${targetSub.finalRunScore} pts` : '0 pts';
  const targetSubBackup = { ...targetSub };
  const prevFinalScoreA = match.finalScoreA;
  const prevFinalScoreB = match.finalScoreB;

  Object.assign(targetSub, {
    ...calculated,
    submittedByName: `${targetSub.submittedByName} (Corrected by Admin ${admin.displayName || admin.username})`
  });

  const newScoreA = Number(((match.teamARun1?.finalRunScore || 0) + (match.teamARun2?.finalRunScore || 0)).toFixed(2));
  const newScoreB = Number(((match.teamBRun1?.finalRunScore || 0) + (match.teamBRun2?.finalRunScore || 0)).toFixed(2));
  match.finalScoreA = newScoreA;
  match.finalScoreB = newScoreB;
  match.updatedAt = isoNow;

  const teamLookup: Record<string, { name: string; logoUrl?: string }> = {};
  db.data.teams.forEach((t) => {
    teamLookup[t.id] = { name: t.name, logoUrl: t.logoUrl };
  });

  // Authoritatively recompute winner if match was completed/finalized or had an established winner
  if (match.teamAId && match.teamBId && (match.matchStatus === 'FINAL' || match.winnerTeamId || (match.teamARun1 && match.teamBRun1))) {
    const teamAData = {
      teamId: match.teamAId,
      run1: match.teamARun1,
      run2: match.teamARun2
    };
    const teamBData = {
      teamId: match.teamBId,
      run1: match.teamBRun1,
      run2: match.teamBRun2
    };

    const recomputed = determineMatchWinner(teamAData, teamBData);
    const previousWinnerId = match.winnerTeamId;
    const newWinnerId = recomputed.isTied ? null : recomputed.winnerTeamId;

    if (previousWinnerId && newWinnerId !== previousWinnerId) {
      const reconcileRes = reconcileMatchAdvancement(
        db.data.matches,
        match,
        previousWinnerId,
        newWinnerId,
        teamLookup,
        tournament?.roundIntermissionMinutes || 10,
        `Score correction: ${reason}`
      );

      if (!reconcileRes.success) {
        // Rollback score change to prevent data inconsistency
        Object.assign(targetSub, targetSubBackup);
        match.finalScoreA = prevFinalScoreA;
        match.finalScoreB = prevFinalScoreB;
        return { success: false, error: reconcileRes.error };
      }

      if (reconcileRes.auditEvent) {
        db.data.auditLogs.push({
          id: uuidv4(),
          actorType: 'ADMIN',
          actorId: admin.id,
          actorName: admin.displayName || admin.username,
          action: reconcileRes.auditEvent.action,
          entityType: 'MATCH',
          entityId: match.id,
          metadata: reconcileRes.auditEvent,
          timestamp: isoNow
        });
      }

      if (newWinnerId) {
        match.winnerTeamId = newWinnerId;
        match.loserTeamId = newWinnerId === match.teamAId ? match.teamBId : match.teamAId;
        if (!match.nextMatchId && tournament) {
          tournament.championTeamId = newWinnerId;
          tournament.championTeamName = teamLookup[newWinnerId]?.name;
        }
      } else {
        match.winnerTeamId = null;
        match.loserTeamId = null;
        match.matchStatus = 'ADMIN_REVIEW';
        match.adminNotes = 'Tie detected across all metrics following score correction. Tiebreaker run required.';
        if (!match.nextMatchId && tournament) {
          tournament.championTeamId = null;
          tournament.championTeamName = null;
          tournament.status = 'LIVE';
        }
      }
    } else if (newWinnerId && previousWinnerId === newWinnerId) {
      match.winnerTeamId = newWinnerId;
      match.loserTeamId = newWinnerId === match.teamAId ? match.teamBId : match.teamAId;
    }
  }

  if (tournament) {
    tournament.currentRound = calculateTournamentCurrentRound(
      db.data.matches.filter((m) => m.tournamentId === tournament.id),
      tournament.currentRound || 1
    );
  }

  const targetTeamName = isSlotA ? match.teamAName : match.teamBName;

  const adminAction: AdminAction = {
    id: `act-${uuidv4().slice(0, 8)}`,
    adminId: admin.id,
    adminName: admin.displayName || admin.username,
    tournamentId: match.tournamentId,
    matchId: match.id,
    action: `ADMIN_SCORE_CORRECTION_RUN_${runNum}`,
    oldValue: oldScoreStr,
    newValue: `${calculated.finalRunScore} pts (${calculated.breakdownString})`,
    reason: reason.trim(),
    createdAt: isoNow
  };
  db.data.adminActions.push(adminAction);

  db.data.matchMessages.push({
    id: uuidv4(),
    matchId: match.id,
    userId: admin.id,
    userName: admin.displayName || admin.username,
    userRole: 'ADMIN',
    type: 'ADMIN',
    message: `ADMIN SCORE CORRECTION: ${targetTeamName} Run ${runNum} updated to ${calculated.finalRunScore} pts (${calculated.breakdownString}).\nReason: "${reason}"`,
    createdAt: isoNow
  });

  db.data.auditLogs.push({
    id: uuidv4(),
    actorType: 'ADMIN',
    actorId: admin.id,
    actorName: admin.username,
    action: 'ADMIN_SCORE_OVERRIDE',
    entityType: 'MATCH',
    entityId: match.id,
    metadata: { teamId, runNumber: runNum, calculated, reason },
    timestamp: isoNow
  });

  return {
    success: true,
    oldScoreStr,
    newScoreStr: `${calculated.finalRunScore} pts (${calculated.breakdownString})`
  };
}

// Resolve Dispute
router.post('/disputes/:id/resolve', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const dispute = db.data.matchDisputes.find((d) => d.id === req.params.id);

  if (!dispute) {
    return res.status(404).json({ error: 'Dispute not found.' });
  }

  // Only disputes currently in OPEN or INVESTIGATING status may be resolved.
  // Reject RESOLVED and DISMISSED with HTTP 400.
  const allowedDisputeStatuses = ['OPEN', 'INVESTIGATING'];
  if (!allowedDisputeStatuses.includes(dispute.status)) {
    return res.status(400).json({
      error: `Cannot resolve dispute with status '${dispute.status}'. Only disputes in OPEN or INVESTIGATING status may be resolved.`
    });
  }

  const { resolution, ruling, newScoreData, reason } = req.body;
  if (!resolution || !reason) {
    return res.status(400).json({ error: 'Resolution details and written reason are required.' });
  }

  const match = db.data.matches.find((m) => m.id === dispute.matchId);
  if (!match) {
    return res.status(404).json({ error: 'Associated match not found.' });
  }

  // If score adjustment is requested, validate and execute it BEFORE resolving the dispute
  if (newScoreData) {
    const correctionRes = applyAuthoritativeAdminScoreCorrection({
      match,
      admin,
      teamId: newScoreData.teamId,
      runNumber: newScoreData.runNumber,
      runnerKills: newScoreData.runnerKills,
      extractedCredits: newScoreData.extractedCredits,
      playersExtracted: newScoreData.playersExtracted,
      objectiveCompleted: newScoreData.objectiveCompleted,
      reason
    });

    if (!correctionRes.success) {
      return res.status(400).json({ error: correctionRes.error });
    }
  }

  const isoNow = new Date().toISOString();
  dispute.status = 'RESOLVED';
  dispute.resolution = `${ruling ? `[${ruling}] ` : ''}${resolution}`;
  dispute.assignedAdminId = admin.id;
  dispute.assignedAdminName = admin.displayName || admin.username;
  dispute.updatedAt = isoNow;

  // Unfreeze match and set to RESULT_PENDING with fresh 5m window
  match.matchStatus = 'RESULT_PENDING';
  match.disputeDeadlineAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  match.adminNotes = `Dispute resolved by Admin ${admin.displayName}: ${resolution}`;
  match.updatedAt = isoNow;

  db.data.matchMessages.push({
    id: uuidv4(),
    matchId: match.id,
    userId: admin.id,
    userName: admin.displayName || admin.username,
    userRole: 'ADMIN',
    type: 'ADMIN',
    message: `ADMIN RULING ISSUED by ${admin.displayName}:\n"${resolution}"\nReason: ${reason}\nMatch unfreezes into 5-minute confirmation period.`,
    createdAt: isoNow
  });

  db.data.auditLogs.push({
    id: uuidv4(),
    actorType: 'ADMIN',
    actorId: admin.id,
    actorName: admin.username,
    action: 'DISPUTE_RESOLVED',
    entityType: 'MATCH',
    entityId: dispute.matchId,
    metadata: { disputeId: dispute.id, resolution, reason },
    timestamp: isoNow
  });

  db.save();
  broadcastEvent('DISPUTE_RESOLVED', { disputeId: dispute.id, matchId: dispute.matchId });
  broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });

  return res.json({ success: true, dispute, message: 'Dispute resolved successfully.' });
});

// Admin Assistance Ticket Queue
router.get('/tickets', requireAuth, requireAdmin, (req, res) => {
  return res.json({ tickets: db.data.adminTickets });
});

// Update Ticket Status
router.post('/tickets/:id/update-status', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const ticket = db.data.adminTickets.find((t) => t.id === req.params.id);

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }

  const { status, resolutionNotes } = req.body;
  const validTicketStatuses = ['OPEN', 'CLAIMED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'];
  if (!status || !validTicketStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid ticket status '${status}'. Must be one of: ${validTicketStatuses.join(', ')}.`
    });
  }

  ticket.status = status;
  ticket.assignedAdminId = admin.id;
  ticket.assignedAdminName = admin.displayName || admin.username;
  if (resolutionNotes) ticket.resolutionNotes = resolutionNotes.trim();
  ticket.updatedAt = new Date().toISOString();

  db.save();
  return res.json({ success: true, ticket });
});

// Score Override Control
router.post('/matches/:id/override-score', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const match = db.data.matches.find((m) => m.id === req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  const { teamId, runNumber, runnerKills, extractedCredits, playersExtracted, objectiveCompleted, reason } = req.body;

  const result = applyAuthoritativeAdminScoreCorrection({
    match,
    admin,
    teamId,
    runNumber,
    runnerKills,
    extractedCredits,
    playersExtracted,
    objectiveCompleted,
    reason
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  db.save();
  broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });

  return res.json({ success: true, match, message: 'Score overridden and audit log permanently saved.' });
});

// Admin Match Timer Controls (Extend +15m, Pause, Resume, Restart Ready Check)
router.post('/matches/:id/control-timer', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const match = db.data.matches.find((m) => m.id === req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  const { action, reason } = req.body;
  const isoNow = new Date().toISOString();
  const tourn = db.data.tournaments.find((t) => t.id === match.tournamentId);

  // Validate action enum
  const validActions = ['EXTEND_15_MIN', 'RESTART_READY_CHECK', 'REVERSE_FORFEIT'];
  if (!action || !validActions.includes(action)) {
    return res.status(400).json({ error: `Unknown timer control action '${action}'. Valid actions: ${validActions.join(', ')}.` });
  }

  if (action === 'EXTEND_15_MIN') {
    // State-gate: only when a match clock exists and match is active
    const activeScoringStates = ['ACTIVE', 'RUN_1_PARTIAL', 'RUN_1_COMPLETE'];
    if (!activeScoringStates.includes(match.matchStatus) || !match.matchDeadlineAt) {
      return res.status(400).json({
        error: `Cannot extend clock: match is in '${match.matchStatus}' state and does not have an active playing clock.`
      });
    }

    const currentDeadlineMs = new Date(match.matchDeadlineAt).getTime();
    match.matchDeadlineAt = new Date(currentDeadlineMs + 15 * 60 * 1000).toISOString();

    db.data.matchMessages.push({
      id: uuidv4(),
      matchId: match.id,
      userId: admin.id,
      userName: admin.displayName || admin.username,
      userRole: 'ADMIN',
      type: 'ADMIN',
      message: `ADMIN ACTION: Match clock extended by +15 minutes.${reason ? ` Reason: ${reason}` : ''}`,
      createdAt: isoNow
    });
  } else if (action === 'RESTART_READY_CHECK') {
    // State-gate: only when appropriate (pre-match review, ready check, or no-show review)
    const permittedReadyStates = ['READY_CHECK', 'WAITING_FOR_ROUND', 'DOUBLE_FORFEIT', 'ADMIN_REVIEW'];
    if (!permittedReadyStates.includes(match.matchStatus)) {
      return res.status(400).json({
        error: `Cannot restart Ready Check: match is currently in '${match.matchStatus}' state.`
      });
    }

    const readyMinutes = tourn?.readyWindowMinutes || 10;
    match.matchStatus = 'READY_CHECK';
    match.teamAReady = false;
    match.teamBReady = false;
    match.readyDeadlineAt = new Date(Date.now() + readyMinutes * 60 * 1000).toISOString();

    db.data.matchMessages.push({
      id: uuidv4(),
      matchId: match.id,
      userId: admin.id,
      userName: admin.displayName || admin.username,
      userRole: 'ADMIN',
      type: 'ADMIN',
      message: `ADMIN ACTION: Ready Check reset. ${readyMinutes} minutes granted for both captains to check in.`,
      createdAt: isoNow
    });
  } else if (action === 'REVERSE_FORFEIT') {
    if (match.matchStatus !== 'FORFEIT') {
      return res.status(400).json({ error: `Cannot reverse forfeit: match is in ${match.matchStatus} state, not FORFEIT.` });
    }

    const previousWinnerTeamId = match.winnerTeamId;
    const teamLookup: Record<string, { name: string; logoUrl?: string }> = {};
    db.data.teams.forEach((t) => {
      teamLookup[t.id] = { name: t.name, logoUrl: t.logoUrl };
    });

    // Safely reconcile downstream bracket before reopening match
    const reconcileRes = reconcileMatchAdvancement(
      db.data.matches,
      match,
      previousWinnerTeamId,
      null,
      teamLookup,
      tourn?.roundIntermissionMinutes || 10,
      reason || 'Admin reverse forfeit'
    );

    if (!reconcileRes.success) {
      return res.status(400).json({ error: reconcileRes.error });
    }

    if (reconcileRes.auditEvent) {
      db.data.auditLogs.push({
        id: uuidv4(),
        actorType: 'ADMIN',
        actorId: admin.id,
        actorName: admin.displayName || admin.username,
        action: reconcileRes.auditEvent.action,
        entityType: 'MATCH',
        entityId: match.id,
        metadata: reconcileRes.auditEvent,
        timestamp: isoNow
      });
    }

    const matchMinutes = tourn?.matchWindowMinutes || 75;
    match.matchStatus = 'ACTIVE';
    match.winnerTeamId = null;
    match.loserTeamId = null;
    match.forfeitReason = null;
    match.matchDeadlineAt = new Date(Date.now() + matchMinutes * 60 * 1000).toISOString();

    if (tourn) {
      if (tourn.championTeamId === previousWinnerTeamId) {
        tourn.championTeamId = null;
        tourn.championTeamName = null;
        tourn.status = 'LIVE';
      }
      tourn.currentRound = calculateTournamentCurrentRound(
        db.data.matches.filter((m) => m.tournamentId === tourn.id),
        tourn.currentRound || 1
      );
    }

    db.data.matchMessages.push({
      id: uuidv4(),
      matchId: match.id,
      userId: admin.id,
      userName: admin.displayName || admin.username,
      userRole: 'ADMIN',
      type: 'ADMIN',
      message: `ADMIN ACTION: Forfeit reversed by Administrator.${reason ? ` Reason: ${reason}` : ''} Downstream participant cleared and match resumed.`,
      createdAt: isoNow
    });
  }

  match.updatedAt = isoNow;

  db.data.adminActions.push({
    id: `act-${uuidv4().slice(0, 8)}`,
    adminId: admin.id,
    adminName: admin.displayName || admin.username,
    tournamentId: match.tournamentId,
    matchId: match.id,
    action: `TIMER_CONTROL_${action}`,
    reason: reason || 'Administrative decision',
    createdAt: isoNow
  });

  db.save();
  broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });

  return res.json({ success: true, match, message: `Action ${action} completed.` });
});

// Admin Declare Winner & Manual Advance
router.post('/matches/:id/override-winner', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const match = db.data.matches.find((m) => m.id === req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  const { winnerTeamId, reason } = req.body;
  if (!winnerTeamId || !reason || !reason.trim()) {
    return res.status(400).json({ error: 'Winner team ID and written reason are required.' });
  }

  // Validate that winnerTeamId is one of match.teamAId or match.teamBId
  if (winnerTeamId !== match.teamAId && winnerTeamId !== match.teamBId) {
    return res.status(400).json({
      error: `Invalid winner team ID '${winnerTeamId}'. Winner must be either Team A (${match.teamAId}) or Team B (${match.teamBId}).`
    });
  }

  const winningTeamName = winnerTeamId === match.teamAId ? match.teamAName : match.teamBName;
  const isoNow = new Date().toISOString();

  const teamLookup: Record<string, { name: string; logoUrl?: string }> = {};
  db.data.teams.forEach((t) => {
    teamLookup[t.id] = { name: t.name, logoUrl: t.logoUrl };
  });

  const tourn = db.data.tournaments.find((t) => t.id === match.tournamentId);
  const previousWinnerTeamId = match.winnerTeamId;

  // If winner is changing from an already-established winner
  if (previousWinnerTeamId && previousWinnerTeamId !== winnerTeamId) {
    const reconcileRes = reconcileMatchAdvancement(
      db.data.matches,
      match,
      previousWinnerTeamId,
      winnerTeamId,
      teamLookup,
      tourn?.roundIntermissionMinutes || 10,
      `Admin winner override: ${reason}`
    );

    if (!reconcileRes.success) {
      return res.status(400).json({ error: reconcileRes.error });
    }

    if (reconcileRes.auditEvent) {
      db.data.auditLogs.push({
        id: uuidv4(),
        actorType: 'ADMIN',
        actorId: admin.id,
        actorName: admin.displayName || admin.username,
        action: reconcileRes.auditEvent.action,
        entityType: 'MATCH',
        entityId: match.id,
        metadata: reconcileRes.auditEvent,
        timestamp: isoNow
      });
    }
  }

  // Advance winner
  const advanceRes = advanceMatchWinner(
    db.data.matches,
    match.id,
    winnerTeamId,
    teamLookup,
    tourn?.roundIntermissionMinutes || 10,
    `Admin Override: ${reason}`
  );

  if (!advanceRes.success) {
    return res.status(400).json({ error: advanceRes.error });
  }

  if (advanceRes.auditEvent) {
    db.data.auditLogs.push({
      id: uuidv4(),
      actorType: 'ADMIN',
      actorId: admin.id,
      actorName: admin.displayName || admin.username,
      action: advanceRes.auditEvent.action,
      entityType: 'MATCH',
      entityId: match.id,
      metadata: advanceRes.auditEvent,
      timestamp: isoNow
    });
  }

  match.matchStatus = 'FINAL';
  match.winnerTeamId = winnerTeamId;
  match.loserTeamId = winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
  match.adminNotes = `Winner manually declared by Admin: ${reason}`;
  match.updatedAt = isoNow;

  if (advanceRes.isTournamentComplete && advanceRes.championTeamId) {
    if (tourn) {
      tourn.status = 'COMPLETED';
      tourn.championTeamId = advanceRes.championTeamId;
      tourn.championTeamName = teamLookup[advanceRes.championTeamId]?.name;
      tourn.updatedAt = isoNow;
    }
  }

  if (tourn) {
    tourn.currentRound = calculateTournamentCurrentRound(
      db.data.matches.filter((m) => m.tournamentId === tourn.id),
      tourn.currentRound || 1
    );
  }

  db.data.adminActions.push({
    id: `act-${uuidv4().slice(0, 8)}`,
    adminId: admin.id,
    adminName: admin.displayName || admin.username,
    tournamentId: match.tournamentId,
    matchId: match.id,
    action: 'ADMIN_OVERRIDE_WINNER',
    newValue: `Winner: ${winningTeamName}`,
    reason: reason.trim(),
    createdAt: isoNow
  });

  db.data.matchMessages.push({
    id: uuidv4(),
    matchId: match.id,
    userId: admin.id,
    userName: admin.displayName || admin.username,
    userRole: 'ADMIN',
    type: 'ADMIN',
    message: `ADMIN DECISION: Winner declared as ${winningTeamName}.\nReason: "${reason}"\nWinner advanced in bracket.`,
    createdAt: isoNow
  });

  db.save();
  broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });

  return res.json({ success: true, match, message: `Winner ${winningTeamName} advanced successfully.` });
});

// Admin Audit Logs
router.get('/audit-logs', requireAuth, requireAdmin, (req, res) => {
  return res.json({
    adminActions: db.data.adminActions.slice().reverse(),
    systemAuditLogs: db.data.auditLogs.slice().reverse()
  });
});

export default router;
