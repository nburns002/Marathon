import { Router, Response } from 'express';
import { isConfirmedRegistration } from '../paymentService';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, optionalAuth } from '../middleware';
import { parseScoreCommandStrict } from '../scoring';
import { calculateTournamentCurrentRound } from '../bracket';
import { MatchEvidence, MatchDispute, AdminTicket, MatchMessage } from '../../src/types';
import { broadcastEvent } from '../timerWorker';
import {
  buildViewerContext,
  serializeMatchForViewer,
  serializeMessagesForViewer,
  serializeEvidenceForViewer,
  serializeAdminTicketsForViewer
} from '../serializer';
import { isEvidenceUrl } from '../evidenceUrl';
import { submitScoreAuthoritative } from '../scoreSubmissionService';
import { formatTournamentDTO } from './tournaments';

const router = Router();

// GET /api/matches - Match List Endpoint (Safe Public & Filtered)
router.get('/', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const { tournamentId, status, round } = req.query;

  let matches = [...db.data.matches];

  if (tournamentId && typeof tournamentId === 'string') {
    matches = matches.filter((m) => m.tournamentId === tournamentId);
  }
  if (status && typeof status === 'string') {
    matches = matches.filter((m) => m.matchStatus === status);
  }
  if (round) {
    const roundNum = Number(round);
    if (!isNaN(roundNum)) {
      matches = matches.filter((m) => m.round === roundNum);
    }
  }

  const sanitizedMatches = matches.map((m) => {
    const viewerContext = buildViewerContext(req.user, m);
    return serializeMatchForViewer(m, viewerContext);
  });

  return res.json({ matches: sanitizedMatches });
});

// GET /api/matches/:id - Match Room Details
router.get('/:id', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const match = db.data.matches.find((m) => m.id === req.params.id);
  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  const tournament = db.data.tournaments.find((t) => t.id === match.tournamentId);
  const regCount = tournament
    ? db.data.tournamentRegistrations.filter(
        (r) => r.tournamentId === tournament.id && isConfirmedRegistration(r)
      ).length
    : 0;
  const formattedTournament = tournament ? formatTournamentDTO(tournament, regCount) : null;
  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const teamB = match.teamBId ? db.data.teams.find((t) => t.id === match.teamBId) : null;

  const regA = match.teamAId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamAId)
    : null;
  const regB = match.teamBId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamBId)
    : null;

  const rawMessages = db.data.matchMessages.filter((msg) => msg.matchId === match.id);
  const rawEvidence = db.data.matchEvidence.filter((ev) => ev.matchId === match.id);
  const rawDisputes = db.data.matchDisputes.filter((d) => d.matchId === match.id);
  const rawAdminTickets = db.data.adminTickets.filter((tkt) => tkt.matchId === match.id);

  const viewerContext = buildViewerContext(req.user, match);
  const sanitizedMatch = serializeMatchForViewer(match, viewerContext);
  const sanitizedMessages = serializeMessagesForViewer(rawMessages, viewerContext, match);
  const sanitizedEvidence = serializeEvidenceForViewer(rawEvidence, viewerContext, match);
  const sanitizedTickets = serializeAdminTicketsForViewer(rawAdminTickets, viewerContext);

  const teamACaptainId = regA?.captainUserId || teamA?.captainUserId || null;
  const teamBCaptainId = regB?.captainUserId || teamB?.captainUserId || null;

  return res.json({
    match: {
      ...sanitizedMatch,
      teamACaptainId,
      teamBCaptainId
    },
    tournament: formattedTournament,
    teamA: teamA
      ? {
          id: teamA.id,
          name: teamA.name,
          tag: teamA.tag,
          logoUrl: teamA.logoUrl,
          captainUserId: teamACaptainId || teamA.captainUserId,
          roster: regA?.rosterSnapshot || []
        }
      : null,
    teamB: teamB
      ? {
          id: teamB.id,
          name: teamB.name,
          tag: teamB.tag,
          logoUrl: teamB.logoUrl,
          captainUserId: teamBCaptainId || teamB.captainUserId,
          roster: regB?.rosterSnapshot || []
        }
      : null,
    teamACaptainId,
    teamBCaptainId,
    messages: sanitizedMessages,
    evidence: sanitizedEvidence,
    disputes: rawDisputes,
    adminTickets: sanitizedTickets
  });
});

// POST /api/matches/:id/ready - Captain Clicks Ready
router.post('/:id/ready', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const match = db.data.matches.find((m) => m.id === req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  // Reject check-in if not currently in READY_CHECK
  if (match.matchStatus !== 'READY_CHECK') {
    return res.status(400).json({
      error:
        match.matchStatus === 'WAITING_FOR_ROUND'
          ? 'Match is currently in round intermission. Captains cannot check in until the Ready Check window officially opens.'
          : `Cannot ready up. Match state is ${match.matchStatus}.`
    });
  }

  if (match.readyDeadlineAt && Date.now() >= Date.parse(match.readyDeadlineAt)) {
    return res.status(400).json({ error: 'The Ready Check deadline has passed.' });
  }

  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const teamB = match.teamBId ? db.data.teams.find((t) => t.id === match.teamBId) : null;

  const regA = match.teamAId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamAId)
    : null;
  const regB = match.teamBId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamBId)
    : null;

  const isCaptainA = (regA?.captainUserId ?? teamA?.captainUserId) === user.id;
  const isCaptainB = (regB?.captainUserId ?? teamB?.captainUserId) === user.id;
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isCaptainA && !isCaptainB && !isAdmin) {
    return res.status(403).json({ error: 'Only the Team Captain may check in the team.' });
  }

  const requestedSlot = req.body?.teamSlot;
  const slot = isCaptainA ? 'A' : isCaptainB ? 'B' : requestedSlot;
  if ((slot !== 'A' && slot !== 'B') || (slot === 'A' ? !match.teamAId : !match.teamBId)) {
    return res.status(400).json({ error: 'Choose a participating team for Ready Check.' });
  }
  if (slot === 'A' ? match.teamAReady : match.teamBReady) {
    return res.json({ success: true, match: serializeMatchForViewer(match, buildViewerContext(user, match)) });
  }

  const isoNow = new Date().toISOString();
  let teamReadyName = '';

  if (slot === 'A') {
    match.teamAReady = true;
    match.teamAReadyAt = isoNow;
    teamReadyName = match.teamAName || 'Team A';
  } else {
    match.teamBReady = true;
    match.teamBReadyAt = isoNow;
    teamReadyName = match.teamBName || 'Team B';
  }

  db.data.matchMessages.push({
    id: uuidv4(),
    matchId: match.id,
    userId: user.id,
    userName: user.displayName || user.username,
    userRole: user.role,
    type: 'SYSTEM',
    message: `READY CHECK — ${teamReadyName} checked in.`,
    createdAt: isoNow
  });

  // If BOTH teams are ready -> START MATCH WINDOW
  if (match.teamAReady && match.teamBReady) {
    const tournament = db.data.tournaments.find((t) => t.id === match.tournamentId);
    const matchWindowMinutes = tournament?.matchWindowMinutes || 75;

    match.matchStatus = 'ACTIVE';
    match.matchStartedAt = isoNow;
    match.matchDeadlineAt = new Date(Date.now() + matchWindowMinutes * 60 * 1000).toISOString();
    match.readyDeadlineAt = null;

    db.data.matchMessages.push({
      id: uuidv4(),
      matchId: match.id,
      userId: 'SYSTEM',
      userName: 'SYSTEM',
      userRole: 'SYSTEM',
      type: 'SYSTEM',
      message: `SYSTEM — BOTH TEAMS READY! ${matchWindowMinutes}-Minute Match Window officially started.\nPlay Cryo Archive Run 1 and submit scores promptly.`,
      createdAt: isoNow
    });

    db.data.auditLogs.push({
      id: uuidv4(),
      actorType: 'SYSTEM',
      actorId: 'SYSTEM',
      actorName: 'Tournament Engine',
      action: 'MATCH_STARTED',
      entityType: 'MATCH',
      entityId: match.id,
      timestamp: isoNow
    });

    if (tournament) {
      tournament.currentRound = calculateTournamentCurrentRound(
        db.data.matches.filter((m) => m.tournamentId === tournament.id),
        tournament.currentRound || 1
      );
    }
  }

  match.updatedAt = isoNow;
  db.save();
  broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });

  return res.json({
    success: true,
    match: serializeMatchForViewer(match, buildViewerContext(user, match)),
    message: `${teamReadyName} is now marked READY.`
  });
});

// Authoritative Handler for GUI Score Submission
function handleScoreSubmission(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const matchId = req.params.id;
  const { runNumber, runnerKills, extractedCredits, playersExtracted, objectiveCompleted, evidenceUrl, teamId } = req.body;

  const result = submitScoreAuthoritative({
    matchId,
    user,
    teamId,
    runNumber,
    runnerKills,
    extractedCredits,
    playersExtracted,
    objectiveCompleted,
    evidenceUrl,
    isChatCommand: false
  });

  if (!result.success) {
    return res.status(result.statusCode || 400).json({ error: result.error });
  }

  const match = result.match!;
  return res.json({ ...result, match: serializeMatchForViewer(match, buildViewerContext(user, match)) });
}

// Support BOTH /submit-score AND canonical /score endpoints
router.post('/:id/submit-score', requireAuth, handleScoreSubmission);
router.post('/:id/score', requireAuth, handleScoreSubmission);

// POST /api/matches/:id/messages - Match Chat and /score command
router.post('/:id/messages', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const match = db.data.matches.find((m) => m.id === req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  const { message } = req.body;
  if (typeof message !== 'string' || !message.trim() || message.length > 2000) {
    return res.status(400).json({ error: 'Enter a message of up to 2,000 characters.' });
  }

  // Access control: Only snapshotted tournament roster participants and admins may post chat
  const { isRosterA, isRosterB, teamId: userTeamId } = buildViewerContext(user, match);

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isRosterA && !isRosterB && !isAdmin) {
    return res.status(403).json({ error: 'Only confirmed match competitors and tournament officials may post messages in this match room.' });
  }

  const trimmed = message.trim();
  const userTeamName = isRosterA ? match.teamAName || undefined : isRosterB ? match.teamBName || undefined : undefined;
  const isoNow = new Date().toISOString();

  // If structured score command
  if (trimmed.startsWith('/score')) {
    const parsedRes = parseScoreCommandStrict(trimmed);
    if (!parsedRes.success || !parsedRes.data) {
      return res.status(400).json({ error: parsedRes.error || 'Invalid /score command syntax.' });
    }

    const { runNumber, runnerKills, extractedCredits, playersExtracted, objectiveCompleted } = parsedRes.data;
    const submitRes = submitScoreAuthoritative({
      matchId: match.id,
      user,
      teamId: userTeamId,
      runNumber,
      runnerKills,
      extractedCredits,
      playersExtracted,
      objectiveCompleted,
      isChatCommand: true
    });

    if (!submitRes.success) {
      return res.status(submitRes.statusCode || 400).json({ error: submitRes.error });
    }

    return res.json({
      success: true,
      submission: submitRes.submission,
      message: submitRes.message
    });
  }

  // Regular chat message
  const chatMsg: MatchMessage = {
    id: uuidv4(),
    matchId: match.id,
    userId: user.id,
    userName: user.displayName || user.username,
    userRole: user.role,
    teamId: userTeamId,
    teamName: userTeamName,
    type: isAdmin ? 'ADMIN' : 'CHAT',
    message: trimmed,
    createdAt: isoNow
  };

  db.data.matchMessages.push(chatMsg);
  db.save();
  broadcastEvent('MESSAGE_POSTED', { matchId: match.id });

  return res.json({ success: true, message: chatMsg });
});

// Authoritative Handler for Captain Dispute
function handleDispute(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const match = db.data.matches.find((m) => m.id === req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  if (match.matchStatus !== 'RESULT_PENDING') {
    return res.status(400).json({
      error:
        match.matchStatus === 'FINAL'
          ? 'Match has already been finalized. Disputes cannot be raised on finalized matches.'
          : `Disputes can only be raised while provisional results are pending review (current state: ${match.matchStatus}).`
    });
  }

  if (!match.disputeDeadlineAt) {
    return res.status(400).json({ error: 'Dispute window has not been opened for this match.' });
  }

  const nowMs = Date.now();
  const deadlineMs = new Date(match.disputeDeadlineAt).getTime();
  if (nowMs >= deadlineMs) {
    return res.status(400).json({
      error: 'Dispute deadline has expired. Match result has transitioned to finalization.'
    });
  }

  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const teamB = match.teamBId ? db.data.teams.find((t) => t.id === match.teamBId) : null;

  const regA = match.teamAId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamAId)
    : null;
  const regB = match.teamBId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamBId)
    : null;

  const isCaptainA = (regA?.captainUserId ?? teamA?.captainUserId) === user.id;
  const isCaptainB = (regB?.captainUserId ?? teamB?.captainUserId) === user.id;
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isCaptainA && !isCaptainB && !isAdmin) {
    return res.status(403).json({
      error: 'Only the verified Team Captain of a participating team may lodge a formal match dispute.'
    });
  }

  const { category, description, reason, evidenceUrls, evidenceUrl, runNumber } = req.body ?? {};
  const suppliedDescription = description || reason;
  const desc = typeof suppliedDescription === 'string' ? suppliedDescription.trim() : '';
  if (!desc || desc.length > 2000 || (category !== undefined && (typeof category !== 'string' || category.length > 80)) ||
      (runNumber != null && ![1, 2, '1', '2'].includes(runNumber))) {
    return res.status(400).json({ error: 'A specific explanation of the discrepancy is required.' });
  }

  const requestingTeamId = isCaptainA ? match.teamAId! : isCaptainB ? match.teamBId! : match.teamAId!;
  const requestingTeamName = isCaptainA ? match.teamAName! : isCaptainB ? match.teamBName! : match.teamAName!;
  const disputedTeamId = isCaptainA ? match.teamBId! : match.teamAId!;
  const disputedTeamName = isCaptainA ? match.teamBName! : match.teamAName!;

  const allEvidence = [...(Array.isArray(evidenceUrls) ? evidenceUrls : [evidenceUrls]), evidenceUrl].filter(Boolean);
  if (allEvidence.length > 5 || allEvidence.some((url) => !isEvidenceUrl(url))) {
    return res.status(400).json({ error: 'Supply up to five valid HTTP or HTTPS evidence links.' });
  }
  match.matchStatus = 'DISPUTED';
  const isoNow = new Date().toISOString();
  match.updatedAt = isoNow;

  const dispute: MatchDispute = {
    id: `disp-${uuidv4().slice(0, 8)}`,
    matchId: match.id,
    requestingTeamId,
    requestingTeamName,
    disputedTeamId,
    disputedTeamName,
    runNumber: runNumber ? (Number(runNumber) as 1 | 2) : undefined,
    category: category || 'Scoring Discrepancy',
    description: desc,
    evidenceUrls: allEvidence,
    status: 'OPEN',
    createdAt: isoNow,
    updatedAt: isoNow
  };

  db.data.matchDisputes.push(dispute);

  const ticket: AdminTicket = {
    id: `tkt-${uuidv4().slice(0, 8)}`,
    matchId: match.id,
    tournamentId: match.tournamentId,
    requestingUserId: user.id,
    requestingUserName: user.displayName || user.username,
    requestingTeamId,
    requestingTeamName,
    category: `DISPUTE: ${category || 'Score Discrepancy'}`,
    description: desc,
    status: 'OPEN',
    createdAt: isoNow,
    updatedAt: isoNow
  };

  db.data.adminTickets.push(ticket);

  db.data.matchMessages.push({
    id: uuidv4(),
    matchId: match.id,
    userId: user.id,
    userName: user.displayName || user.username,
    userRole: user.role,
    teamId: requestingTeamId,
    teamName: requestingTeamName,
    type: 'FLAG',
    message: `RESULT FLAGGED BY ${requestingTeamName}: "${category || 'Score Discrepancy'}" — Match frozen for Referee Investigation.`,
    createdAt: isoNow
  });

  db.data.auditLogs.push({
    id: uuidv4(),
    actorType: 'USER',
    actorId: user.id,
    actorName: user.username,
    action: 'RESULT_FLAGGED',
    entityType: 'MATCH',
    entityId: match.id,
    metadata: { disputeId: dispute.id, category, description },
    timestamp: isoNow
  });

  db.save();
  broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });

  return res.json({
    success: true,
    dispute,
    message: 'Result flagged. Match progression is frozen and an administrator has been summoned.'
  });
}

// Support BOTH /flag-result AND canonical /dispute endpoints
router.post('/:id/flag-result', requireAuth, handleDispute);
router.post('/:id/dispute', requireAuth, handleDispute);

// POST /api/matches/:id/request-admin
router.post('/:id/request-admin', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const match = db.data.matches.find((m) => m.id === req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  const { category, description } = req.body ?? {};
  if (typeof description !== 'string' || !description.trim() || description.length > 2000 ||
      (category !== undefined && (typeof category !== 'string' || category.length > 80))) {
    return res.status(400).json({ error: 'Please describe the issue requiring administrator assistance.' });
  }

  const { isRosterA, isRosterB } = buildViewerContext(user, match);

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isRosterA && !isRosterB && !isAdmin) {
    return res.status(403).json({
      error: 'Only participating players or tournament administrators can request referee assistance for this match.'
    });
  }

  const requestingTeamId = isRosterA ? match.teamAId! : isRosterB ? match.teamBId! : undefined;
  const requestingTeamName = isRosterA ? match.teamAName! : isRosterB ? match.teamBName! : undefined;

  const isoNow = new Date().toISOString();

  const ticket: AdminTicket = {
    id: `tkt-${uuidv4().slice(0, 8)}`,
    matchId: match.id,
    tournamentId: match.tournamentId,
    requestingUserId: user.id,
    requestingUserName: user.displayName || user.username,
    requestingTeamId,
    requestingTeamName,
    category: category || 'Technical / Referee Assistance',
    description: description.trim(),
    status: 'OPEN',
    createdAt: isoNow,
    updatedAt: isoNow
  };

  db.data.adminTickets.push(ticket);

  db.save();
  broadcastEvent('ADMIN_TICKET_CREATED', {});

  return res.json({
    success: true,
    ticket,
    message: 'Administrator ticket submitted. A tournament referee will join the Match Room shortly.'
  });
});

// POST /api/matches/:id/evidence - Upload Evidence with Strict Access Rules
router.post('/:id/evidence', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const match = db.data.matches.find((m) => m.id === req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  const { type, url, description, runNumber } = req.body ?? {};
  if (typeof url !== 'string' || !url.trim() || url.length > 2048) {
    return res.status(400).json({ error: 'Enter an evidence URL of up to 2,048 characters.' });
  }
  const trimmedUrl = url.trim();
  if (!isEvidenceUrl(trimmedUrl)) {
    return res.status(400).json({ error: 'Evidence URL must use http:// or https:// without embedded credentials.' });
  }
  if (type !== undefined && typeof type !== 'string') {
    return res.status(400).json({ error: 'Invalid evidence type.' });
  }

  // Validate type enum
  const validTypes = ['VOD', 'SCREENSHOT', 'CLIP', 'LOG'];
  const evType = (type ? type.toUpperCase() : 'VOD') as 'VOD' | 'SCREENSHOT' | 'CLIP' | 'LOG';
  if (!validTypes.includes(evType)) {
    return res.status(400).json({ error: `Invalid evidence type '${type}'. Must be one of: VOD, SCREENSHOT, CLIP, LOG.` });
  }

  // Validate run number
  let parsedRunNum: (1 | 2) | undefined;
  if (runNumber !== undefined && runNumber !== null) {
    const num = Number(runNumber);
    if (num !== 1 && num !== 2) {
      return res.status(400).json({ error: 'Run number must be 1 or 2.' });
    }
    parsedRunNum = num as 1 | 2;
  }

  // Validate description length
  if (description !== undefined && (typeof description !== 'string' || description.length > 500)) {
    return res.status(400).json({ error: 'Description must not exceed 500 characters.' });
  }

  // Participant authorization: User MUST be in Team A or Team B snapshotted roster or Admin
  const { isRosterA, isRosterB } = buildViewerContext(user, match);

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isRosterA && !isRosterB && !isAdmin) {
    return res.status(403).json({ error: 'Only participating players or tournament administrators can upload match evidence.' });
  }

  // Determine submitting team explicitly
  const teamId = isRosterA ? match.teamAId! : isRosterB ? match.teamBId! : match.teamAId!;
  const teamName = isRosterA ? (match.teamAName || 'Team A') : isRosterB ? (match.teamBName || 'Team B') : 'Admin';

  const isoNow = new Date().toISOString();
  const evidence: MatchEvidence = {
    id: `ev-${uuidv4().slice(0, 8)}`,
    matchId: match.id,
    teamId,
    teamName,
    runNumber: parsedRunNum,
    type: evType,
    url: trimmedUrl,
    description: description?.trim(),
    uploadedBy: user.id,
    uploadedByName: user.displayName || user.username,
    createdAt: isoNow
  };

  db.data.matchEvidence.push(evidence);

  db.save();
  broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });

  return res.json({ success: true, evidence });
});

export default router;
