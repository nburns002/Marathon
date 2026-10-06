import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, requireAdmin } from '../middleware';
import { calculateRunScore } from '../scoring';
import { advanceMatchWinner } from '../bracket';
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

// Resolve Dispute
router.post('/disputes/:id/resolve', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const admin = req.user!;
  const dispute = db.data.matchDisputes.find((d) => d.id === req.params.id);

  if (!dispute) {
    return res.status(404).json({ error: 'Dispute not found.' });
  }

  const { resolution, ruling, newScoreData, reason } = req.body;
  if (!resolution || !reason) {
    return res.status(400).json({ error: 'Resolution details and written reason are required.' });
  }

  const isoNow = new Date().toISOString();
  dispute.status = 'RESOLVED';
  dispute.resolution = `${ruling ? `[${ruling}] ` : ''}${resolution}`;
  dispute.assignedAdminId = admin.id;
  dispute.assignedAdminName = admin.displayName || admin.username;
  dispute.updatedAt = isoNow;

  const match = db.data.matches.find((m) => m.id === dispute.matchId);

  // If score adjustment requested
  if (match && newScoreData) {
    const isSlotA = newScoreData.teamId === match.teamAId;
    const runNum = newScoreData.runNumber as 1 | 2;

    const recalculated = calculateRunScore({
      runnerKills: Number(newScoreData.runnerKills),
      extractedCredits: Number(newScoreData.extractedCredits),
      playersExtracted: Number(newScoreData.playersExtracted) as 0 | 1 | 2 | 3,
      objectiveCompleted: Boolean(newScoreData.objectiveCompleted)
    });

    const targetSub = isSlotA
      ? (runNum === 1 ? match.teamARun1 : match.teamARun2)
      : (runNum === 1 ? match.teamBRun1 : match.teamBRun2);

    const oldScoreStr = targetSub ? `${targetSub.finalRunScore} pts (kills: ${targetSub.runnerKills}, loot: ${targetSub.extractedCredits})` : 'None';

    if (targetSub) {
      Object.assign(targetSub, {
        ...recalculated,
        submittedByName: `${targetSub.submittedByName} (Corrected by Admin)`
      });
    }

    match.finalScoreA = Number(((match.teamARun1?.finalRunScore || 0) + (match.teamARun2?.finalRunScore || 0)).toFixed(2));
    match.finalScoreB = Number(((match.teamBRun1?.finalRunScore || 0) + (match.teamBRun2?.finalRunScore || 0)).toFixed(2));

    const adminAction: AdminAction = {
      id: `act-${uuidv4().slice(0, 8)}`,
      adminId: admin.id,
      adminName: admin.displayName || admin.username,
      tournamentId: match.tournamentId,
      matchId: match.id,
      action: `CORRECTED_SCORE_RUN_${runNum}`,
      oldValue: oldScoreStr,
      newValue: `${recalculated.finalRunScore} pts (${recalculated.breakdownString})`,
      reason: reason.trim(),
      createdAt: isoNow
    };
    db.data.adminActions.push(adminAction);
  }

  // Unfreeze match and set to RESULT_PENDING with fresh 5m window or FINAL
  if (match) {
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
  }

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

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A mandatory written reason is required for score overrides.' });
  }

  const isSlotA = teamId === match.teamAId;
  const runNum = Number(runNumber) as 1 | 2;

  const tournament = db.data.tournaments.find((t) => t.id === match.tournamentId);
  const calculated = calculateRunScore({
    runnerKills: Number(runnerKills),
    extractedCredits: Number(extractedCredits),
    playersExtracted: Number(playersExtracted) as 0 | 1 | 2 | 3,
    objectiveCompleted: Boolean(objectiveCompleted),
    objectivePointsValue: tournament?.featuredObjectivePoints || 5
  });

  const isoNow = new Date().toISOString();
  const targetSub = isSlotA
    ? (runNum === 1 ? match.teamARun1 : match.teamARun2)
    : (runNum === 1 ? match.teamBRun1 : match.teamBRun2);

  const oldScoreStr = targetSub ? `${targetSub.finalRunScore} pts` : '0 pts';

  if (targetSub) {
    Object.assign(targetSub, {
      ...calculated,
      submittedByName: `${targetSub.submittedByName} (Overridden by ${admin.displayName})`
    });
  }

  match.finalScoreA = Number(((match.teamARun1?.finalRunScore || 0) + (match.teamARun2?.finalRunScore || 0)).toFixed(2));
  match.finalScoreB = Number(((match.teamBRun1?.finalRunScore || 0) + (match.teamBRun2?.finalRunScore || 0)).toFixed(2));
  match.updatedAt = isoNow;

  const targetTeamName = isSlotA ? match.teamAName : match.teamBName;

  const adminAction: AdminAction = {
    id: `act-${uuidv4().slice(0, 8)}`,
    adminId: admin.id,
    adminName: admin.displayName || admin.username,
    tournamentId: match.tournamentId,
    matchId: match.id,
    action: `ADMIN_SCORE_OVERRIDE_RUN_${runNum}`,
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
    message: `ADMIN SCORE OVERRIDE: ${targetTeamName} Run ${runNum} updated to ${calculated.finalRunScore} pts (${calculated.breakdownString}).\nReason: "${reason}"`,
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
    metadata: { teamId, runNumber, calculated, reason },
    timestamp: isoNow
  });

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

  if (action === 'EXTEND_15_MIN') {
    const currentDeadlineMs = match.matchDeadlineAt ? new Date(match.matchDeadlineAt).getTime() : Date.now();
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
    match.matchStatus = 'READY_CHECK';
    match.teamAReady = false;
    match.teamBReady = false;
    match.readyDeadlineAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.data.matchMessages.push({
      id: uuidv4(),
      matchId: match.id,
      userId: admin.id,
      userName: admin.displayName || admin.username,
      userRole: 'ADMIN',
      type: 'ADMIN',
      message: `ADMIN ACTION: Ready Check reset. 10 minutes granted for both captains to check in.`,
      createdAt: isoNow
    });
  } else if (action === 'REVERSE_FORFEIT') {
    match.matchStatus = 'ACTIVE';
    match.winnerTeamId = null;
    match.loserTeamId = null;
    match.forfeitReason = null;
    match.matchDeadlineAt = new Date(Date.now() + 75 * 60 * 1000).toISOString();

    db.data.matchMessages.push({
      id: uuidv4(),
      matchId: match.id,
      userId: admin.id,
      userName: admin.displayName || admin.username,
      userRole: 'ADMIN',
      type: 'ADMIN',
      message: `ADMIN ACTION: Forfeit reversed by Administrator.${reason ? ` Reason: ${reason}` : ''} Match resumed.`,
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
  if (!winnerTeamId || !reason) {
    return res.status(400).json({ error: 'Winner team ID and written reason are required.' });
  }

  const winningTeamName = winnerTeamId === match.teamAId ? match.teamAName : match.teamBName;
  const isoNow = new Date().toISOString();

  const teamLookup: Record<string, { name: string; logoUrl?: string }> = {};
  db.data.teams.forEach((t) => {
    teamLookup[t.id] = { name: t.name, logoUrl: t.logoUrl };
  });

  match.matchStatus = 'FINAL';
  match.winnerTeamId = winnerTeamId;
  match.loserTeamId = winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
  match.adminNotes = `Winner manually declared by Admin: ${reason}`;
  match.updatedAt = isoNow;

  const tourn = db.data.tournaments.find((t) => t.id === match.tournamentId);
  const advanceRes = advanceMatchWinner(
    db.data.matches,
    match.id,
    winnerTeamId,
    teamLookup,
    tourn?.roundIntermissionMinutes || 10
  );

  if (advanceRes.isTournamentComplete && advanceRes.championTeamId) {
    if (tourn) {
      tourn.status = 'COMPLETED';
      tourn.championTeamId = advanceRes.championTeamId;
      tourn.championTeamName = teamLookup[advanceRes.championTeamId]?.name;
      tourn.updatedAt = isoNow;
    }
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
