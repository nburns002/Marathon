import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, optionalAuth } from '../middleware';
import { parseScoreCommandStrict } from '../scoring';
import { calculateTournamentCurrentRound } from '../bracket';
import { MatchEvidence, MatchDispute, AdminTicket } from '../../src/types';
import { broadcastEvent } from '../timerWorker';
import {
  buildViewerContext,
  serializeMatchForViewer,
  serializeMessagesForViewer,
  serializeEvidenceForViewer,
  serializeAdminTicketsForViewer
} from '../serializer';
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
        (r) => r.tournamentId === tournament.id && r.status === 'REGISTERED' && r.paymentStatus === 'PAID'
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

  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const teamB = match.teamBId ? db.data.teams.find((t) => t.id === match.teamBId) : null;

  const regA = match.teamAId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamAId)
    : null;
  const regB = match.teamBId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamBId)
    : null;

  const isCaptainA = (teamA && teamA.captainUserId === user.id) || (regA && regA.captainUserId === user.id);
  const isCaptainB = (teamB && teamB.captainUserId === user.id) || (regB && regB.captainUserId === user.id);
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isCaptainA && !isCaptainB && !isAdmin) {
    return res.status(403).json({ error: 'Only the Team Captain may check in the team.' });
  }

  const isoNow = new Date().toISOString();
  let teamReadyName = '';

  if (isCaptainA || (isAdmin && req.body.teamSlot === 'A')) {
    match.teamAReady = true;
    match.teamAReadyAt = isoNow;
    teamReadyName = match.teamAName || 'Team A';
  } else if (isCaptainB || (isAdmin && req.body.teamSlot === 'B')) {
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
    match,
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
    runNumber: Number(runNumber),
    runnerKills: Number(runnerKills),
    extractedCredits: Number(extractedCredits),
    playersExtracted: Number(playersExtracted),
    objectiveCompleted: Boolean(objectiveCompleted),
    evidenceUrl,
    isChatCommand: false
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result);
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
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }

  // Access control: Only snapshotted tournament roster participants and admins may post chat
  const regA = match.teamAId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamAId)
    : null;
  const regB = match.teamBId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamBId)
    : null;

  const isRosterA =
    (regA?.rosterSnapshot && regA.rosterSnapshot.some((m) => m.userId === user.id)) ||
    regA?.captainUserId === user.id ||
    (match.teamAId ? db.data.teamMembers.some((m) => m.teamId === match.teamAId && m.userId === user.id) : false);

  const isRosterB =
    (regB?.rosterSnapshot && regB.rosterSnapshot.some((m) => m.userId === user.id)) ||
    regB?.captainUserId === user.id ||
    (match.teamBId ? db.data.teamMembers.some((m) => m.teamId === match.teamBId && m.userId === user.id) : false);

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isRosterA && !isRosterB && !isAdmin) {
    return res.status(403).json({ error: 'Only confirmed match competitors and tournament officials may post messages in this match room.' });
  }

  const trimmed = message.trim();
  const userTeamId = isRosterA ? match.teamAId || undefined : isRosterB ? match.teamBId || undefined : undefined;
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
      return res.status(400).json({ error: submitRes.error });
    }

    return res.json({
      success: true,
      submission: submitRes.submission,
      message: submitRes.message
    });
  }

  // Regular chat message
  const chatMsg = {
    id: uuidv4(),
    matchId: match.id,
    userId: user.id,
    userName: user.displayName || user.username,
    userRole: user.role,
    teamId: userTeamId,
    teamName: userTeamName,
    type: (isAdmin ? 'ADMIN' : 'CHAT') as any,
    message: trimmed,
    createdAt: isoNow
  };

  db.data.matchMessages.push(chatMsg);
  db.save();
  broadcastEvent('MESSAGE_POSTED', { matchId: match.id, message: chatMsg });

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

  const isCaptainA = (teamA && teamA.captainUserId === user.id) || (regA && regA.captainUserId === user.id);
  const isCaptainB = (teamB && teamB.captainUserId === user.id) || (regB && regB.captainUserId === user.id);
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isCaptainA && !isCaptainB && !isAdmin) {
    return res.status(403).json({
      error: 'Only the verified Team Captain of a participating team may lodge a formal match dispute.'
    });
  }

  const { category, description, reason, evidenceUrls, evidenceUrl, runNumber } = req.body;
  const desc = (description || reason || '').trim();
  if (!desc) {
    return res.status(400).json({ error: 'A specific explanation of the discrepancy is required.' });
  }

  const requestingTeamId = isCaptainA ? match.teamAId! : isCaptainB ? match.teamBId! : match.teamAId!;
  const requestingTeamName = isCaptainA ? match.teamAName! : isCaptainB ? match.teamBName! : match.teamAName!;
  const disputedTeamId = isCaptainA ? match.teamBId! : match.teamAId!;
  const disputedTeamName = isCaptainA ? match.teamBName! : match.teamAName!;

  match.matchStatus = 'DISPUTED';
  const isoNow = new Date().toISOString();
  match.updatedAt = isoNow;

  let allEvidence: string[] = [];
  if (Array.isArray(evidenceUrls)) {
    allEvidence.push(...evidenceUrls.filter(Boolean));
  } else if (evidenceUrls && typeof evidenceUrls === 'string') {
    allEvidence.push(evidenceUrls.trim());
  }
  if (evidenceUrl && typeof evidenceUrl === 'string' && evidenceUrl.trim()) {
    allEvidence.push(evidenceUrl.trim());
  }

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

  const { category, description } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Please describe the issue requiring administrator assistance.' });
  }

  const regA = match.teamAId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamAId)
    : null;
  const regB = match.teamBId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamBId)
    : null;

  const isRosterA =
    (regA?.rosterSnapshot && regA.rosterSnapshot.some((m) => m.userId === user.id)) ||
    regA?.captainUserId === user.id ||
    (match.teamAId ? db.data.teamMembers.some((m) => m.teamId === match.teamAId && m.userId === user.id) : false);

  const isRosterB =
    (regB?.rosterSnapshot && regB.rosterSnapshot.some((m) => m.userId === user.id)) ||
    regB?.captainUserId === user.id ||
    (match.teamBId ? db.data.teamMembers.some((m) => m.teamId === match.teamBId && m.userId === user.id) : false);

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

  db.data.matchMessages.push({
    id: uuidv4(),
    matchId: match.id,
    userId: user.id,
    userName: user.displayName || user.username,
    userRole: user.role,
    type: 'ADMIN',
    message: `ADMIN ASSISTANCE REQUESTED: "${category || 'Referee Assistance'}" — Ticket #${ticket.id.slice(0, 6)} generated.`,
    createdAt: isoNow
  });

  db.save();
  broadcastEvent('ADMIN_TICKET_CREATED', { ticketId: ticket.id });

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

  const { type, url, description, runNumber } = req.body;
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'Evidence URL or VOD link is required.' });
  }

  // Validate URL scheme and length
  const trimmedUrl = url.trim();
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return res.status(400).json({ error: 'Evidence URL must use http:// or https:// protocol.' });
  }
  if (trimmedUrl.length > 2048) {
    return res.status(400).json({ error: 'Evidence URL must not exceed 2048 characters.' });
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
  if (description && description.length > 500) {
    return res.status(400).json({ error: 'Description must not exceed 500 characters.' });
  }

  // Participant authorization: User MUST be in Team A or Team B snapshotted roster or Admin
  const regA = match.teamAId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamAId)
    : null;
  const regB = match.teamBId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamBId)
    : null;

  const isRosterA =
    (regA?.rosterSnapshot && regA.rosterSnapshot.some((m) => m.userId === user.id)) ||
    regA?.captainUserId === user.id ||
    (match.teamAId ? db.data.teamMembers.some((m) => m.teamId === match.teamAId && m.userId === user.id) : false);

  const isRosterB =
    (regB?.rosterSnapshot && regB.rosterSnapshot.some((m) => m.userId === user.id)) ||
    regB?.captainUserId === user.id ||
    (match.teamBId ? db.data.teamMembers.some((m) => m.teamId === match.teamBId && m.userId === user.id) : false);

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

  db.data.matchMessages.push({
    id: uuidv4(),
    matchId: match.id,
    userId: user.id,
    userName: user.displayName || user.username,
    userRole: user.role,
    teamId,
    teamName,
    type: 'CHAT',
    message: `EVIDENCE SUBMITTED (${evidence.type}): ${evidence.url}${evidence.description ? ` — "${evidence.description}"` : ''}`,
    createdAt: isoNow
  });

  db.save();
  broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });

  return res.json({ success: true, evidence });
});

export default router;
