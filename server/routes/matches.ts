import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, optionalAuth } from '../middleware';
import { calculateRunScore, parseScoreCommand } from '../scoring';
import { RunSubmission, MatchMessage, MatchEvidence, MatchDispute, AdminTicket } from '../../src/types';
import { broadcastEvent } from '../timerWorker';

const router = Router();

// Get Match Room Details
router.get('/:id', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const match = db.data.matches.find((m) => m.id === req.params.id);
  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  const tournament = db.data.tournaments.find((t) => t.id === match.tournamentId);
  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const teamB = match.teamBId ? db.data.teams.find((t) => t.id === match.teamBId) : null;

  // Get Roster snapshots from tournament registration
  const regA = match.teamAId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamAId)
    : null;
  const regB = match.teamBId
    ? db.data.tournamentRegistrations.find((r) => r.tournamentId === match.tournamentId && r.teamId === match.teamBId)
    : null;

  const messages = db.data.matchMessages.filter((msg) => msg.matchId === match.id);
  const evidence = db.data.matchEvidence.filter((ev) => ev.matchId === match.id);
  const disputes = db.data.matchDisputes.filter((d) => d.matchId === match.id);
  const adminTickets = db.data.adminTickets.filter((tkt) => tkt.matchId === match.id);

  // Check information hiding for Run 1:
  // If user is team A captain/member and team B has submitted Run 1 but team A hasn't yet, hide team B's run 1 score
  const isTeamAUser = req.user && regA?.rosterSnapshot.some((r) => r.userId === req.user!.id);
  const isTeamBUser = req.user && regB?.rosterSnapshot.some((r) => r.userId === req.user!.id);
  const isAdmin = req.user && (req.user.role === 'ADMIN' || req.user.role === 'SUPERADMIN');

  let sanitizedTeamARun1 = match.teamARun1;
  let sanitizedTeamBRun1 = match.teamBRun1;

  if (!match.run1Revealed && !isAdmin) {
    if (isTeamAUser && !match.teamARun1 && match.teamBRun1) {
      sanitizedTeamBRun1 = {
        ...match.teamBRun1,
        finalRunScore: 0,
        baseScore: 0,
        runnerKills: 0,
        extractedCredits: 0,
        playersExtracted: 0,
        objectiveCompleted: false,
        killPoints: 0,
        lootPoints: 0,
        objectivePoints: 0,
        survivalMultiplier: 0
      };
    } else if (isTeamBUser && !match.teamBRun1 && match.teamARun1) {
      sanitizedTeamARun1 = {
        ...match.teamARun1,
        finalRunScore: 0,
        baseScore: 0,
        runnerKills: 0,
        extractedCredits: 0,
        playersExtracted: 0,
        objectiveCompleted: false,
        killPoints: 0,
        lootPoints: 0,
        objectivePoints: 0,
        survivalMultiplier: 0
      };
    }
  }

  return res.json({
    match: {
      ...match,
      teamARun1: sanitizedTeamARun1,
      teamBRun1: sanitizedTeamBRun1
    },
    tournament,
    teamA: teamA
      ? {
          id: teamA.id,
          name: teamA.name,
          tag: teamA.tag,
          logoUrl: teamA.logoUrl,
          captainUserId: teamA.captainUserId,
          roster: regA?.rosterSnapshot || []
        }
      : null,
    teamB: teamB
      ? {
          id: teamB.id,
          name: teamB.name,
          tag: teamB.tag,
          logoUrl: teamB.logoUrl,
          captainUserId: teamB.captainUserId,
          roster: regB?.rosterSnapshot || []
        }
      : null,
    messages,
    evidence,
    disputes,
    adminTickets
  });
});

// Captain Clicks Ready
router.post('/:id/ready', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const match = db.data.matches.find((m) => m.id === req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  if (match.matchStatus !== 'READY_CHECK' && match.matchStatus !== 'WAITING_FOR_ROUND') {
    return res.status(400).json({ error: `Cannot ready up. Match state is ${match.matchStatus}.` });
  }

  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const teamB = match.teamBId ? db.data.teams.find((t) => t.id === match.teamBId) : null;

  const isCaptainA = teamA?.captainUserId === user.id;
  const isCaptainB = teamB?.captainUserId === user.id;
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isCaptainA && !isCaptainB && !isAdmin) {
    return res.status(403).json({ error: 'Only the Team Captain may check in the team.' });
  }

  const isoNow = new Date().toISOString();

  // If match was in WAITING_FOR_ROUND, start READY_CHECK with 10 min window
  if (match.matchStatus === 'WAITING_FOR_ROUND') {
    match.matchStatus = 'READY_CHECK';
    match.readyDeadlineAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  }

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

  // If BOTH teams are ready -> START 75-MINUTE MATCH WINDOW!
  if (match.teamAReady && match.teamBReady) {
    match.matchStatus = 'ACTIVE';
    match.matchStartedAt = isoNow;
    match.matchDeadlineAt = new Date(Date.now() + 75 * 60 * 1000).toISOString();
    match.readyDeadlineAt = null; // stop ready countdown

    db.data.matchMessages.push({
      id: uuidv4(),
      matchId: match.id,
      userId: 'SYSTEM',
      userName: 'SYSTEM',
      userRole: 'SYSTEM',
      type: 'SYSTEM',
      message: `SYSTEM — BOTH TEAMS READY! 75-Minute Match Window officially started.\nPlay Cryo Archive Run 1 and submit scores promptly.`,
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

// Submit Run Score (From Form or Chat Parser)
router.post('/:id/submit-score', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const match = db.data.matches.find((m) => m.id === req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  if (
    match.matchStatus !== 'ACTIVE' &&
    match.matchStatus !== 'RUN_1_PARTIAL' &&
    match.matchStatus !== 'RUN_1_COMPLETE'
  ) {
    return res.status(400).json({ error: `Cannot submit score while match is in ${match.matchStatus} state.` });
  }

  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const teamB = match.teamBId ? db.data.teams.find((t) => t.id === match.teamBId) : null;

  const isCaptainA = teamA?.captainUserId === user.id;
  const isCaptainB = teamB?.captainUserId === user.id;
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isCaptainA && !isCaptainB && !isAdmin) {
    return res.status(403).json({ error: 'Only the Team Captain may submit official run scores.' });
  }

  const targetTeamId = isCaptainA ? match.teamAId! : isCaptainB ? match.teamBId! : req.body.teamId || match.teamAId!;
  const targetTeamName = targetTeamId === match.teamAId ? match.teamAName : match.teamBName;
  const isSlotA = targetTeamId === match.teamAId;

  const { runNumber, runnerKills, extractedCredits, playersExtracted, objectiveCompleted, evidenceUrl } = req.body;

  const runNum = Number(runNumber) as 1 | 2;
  if (runNum !== 1 && runNum !== 2) {
    return res.status(400).json({ error: 'Run number must be 1 or 2.' });
  }

  // Check if Run 1 is already locked
  if (runNum === 1) {
    if (isSlotA && match.teamARun1?.locked && !isAdmin) {
      return res.status(400).json({ error: 'Run 1 score is locked and cannot be edited without Administrator authorization.' });
    }
    if (!isSlotA && match.teamBRun1?.locked && !isAdmin) {
      return res.status(400).json({ error: 'Run 1 score is locked and cannot be edited without Administrator authorization.' });
    }
  }

  // Check if Run 2 is submitted before Run 1
  if (runNum === 2) {
    if (isSlotA && !match.teamARun1) {
      return res.status(400).json({ error: 'You must submit Run 1 before submitting Run 2.' });
    }
    if (!isSlotA && !match.teamBRun1) {
      return res.status(400).json({ error: 'You must submit Run 1 before submitting Run 2.' });
    }
  }

  const tournament = db.data.tournaments.find((t) => t.id === match.tournamentId);
  const calculated = calculateRunScore({
    runnerKills: Number(runnerKills),
    extractedCredits: Number(extractedCredits),
    playersExtracted: Number(playersExtracted) as 0 | 1 | 2 | 3,
    objectiveCompleted: Boolean(objectiveCompleted),
    objectivePointsValue: tournament?.featuredObjectivePoints || 5
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

  // Post system message with transparent calculation breakdown
  db.data.matchMessages.push({
    id: uuidv4(),
    matchId: match.id,
    userId: 'SYSTEM',
    userName: 'SYSTEM',
    userRole: 'SYSTEM',
    type: 'SCORE_SUBMISSION',
    message: `SYSTEM — RUN ${runNum} SUBMITTED BY ${targetTeamName}\n${calculated.breakdownString}`,
    structuredScore: submission,
    createdAt: isoNow
  });

  // Evaluate match phase transitions:
  // 1. Run 1 Partial vs Complete
  if (match.teamARun1 && !match.teamBRun1) {
    match.matchStatus = 'RUN_1_PARTIAL';
    match.run1Revealed = false;
  } else if (!match.teamARun1 && match.teamBRun1) {
    match.matchStatus = 'RUN_1_PARTIAL';
    match.run1Revealed = false;
  } else if (match.teamARun1 && match.teamBRun1 && !match.teamARun2 && !match.teamBRun2) {
    match.matchStatus = 'RUN_1_COMPLETE';
    match.run1Revealed = true;

    // Reveal both Run 1 scores and calculate deficit / lead!
    const scoreA1 = match.teamARun1.finalRunScore;
    const scoreB1 = match.teamBRun1.finalRunScore;
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

  // 2. Both teams submit Run 2 -> Result Pending + 10-Minute Dispute Window
  if (match.teamARun1 && match.teamBRun1 && match.teamARun2 && match.teamBRun2) {
    match.matchStatus = 'RESULT_PENDING';
    match.run1Revealed = true;
    match.disputeDeadlineAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    match.finalScoreA = Number((match.teamARun1.finalRunScore + match.teamARun2.finalRunScore).toFixed(2));
    match.finalScoreB = Number((match.teamBRun1.finalRunScore + match.teamBRun2.finalRunScore).toFixed(2));

    const provWinner = match.finalScoreA >= match.finalScoreB ? match.teamAName : match.teamBName;

    db.data.matchMessages.push({
      id: uuidv4(),
      matchId: match.id,
      userId: 'SYSTEM',
      userName: 'SYSTEM',
      userRole: 'SYSTEM',
      type: 'SYSTEM',
      message: `SYSTEM — ALL RUNS COMPLETED. PROVISIONAL RESULT:\n${match.teamAName}: ${match.finalScoreA.toFixed(2)} pts\n${match.teamBName}: ${match.finalScoreB.toFixed(2)} pts\nProvisional Winner: ${provWinner}\n10-Minute Result Review Window started. Finalizes automatically if no dispute is raised.`,
      createdAt: isoNow
    });
  }

  match.updatedAt = isoNow;
  db.save();

  broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });

  return res.json({
    success: true,
    submission,
    match,
    message: `Run ${runNum} submitted successfully.`
  });
});

// Post Chat Message (Supports real-time chat and structured `/score ...` command parsing)
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

  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const teamB = match.teamBId ? db.data.teams.find((t) => t.id === match.teamBId) : null;

  const isCaptainA = teamA?.captainUserId === user.id;
  const isCaptainB = teamB?.captainUserId === user.id;
  const isTeamA = match.teamAId ? db.data.teamMembers.some((m) => m.teamId === match.teamAId && m.userId === user.id) : false;
  const isTeamB = match.teamBId ? db.data.teamMembers.some((m) => m.teamId === match.teamBId && m.userId === user.id) : false;
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  const userTeamId = isTeamA ? match.teamAId : isTeamB ? match.teamBId : undefined;
  const userTeamName = isTeamA ? match.teamAName : isTeamB ? match.teamBName : undefined;

  const isoNow = new Date().toISOString();
  const trimmed = message.trim();

  // Check if message is structured score command: /score run1 ...
  if (trimmed.startsWith('/score')) {
    if (!isCaptainA && !isCaptainB && !isAdmin) {
      return res.status(403).json({ error: 'Only the Team Captain may submit scores using /score command.' });
    }

    const parsed = parseScoreCommand(trimmed);
    if (!parsed) {
      return res.status(400).json({
        error: 'Invalid /score command format. Example: /score run1 kills:6 loot:48000 survived:3 objective:yes'
      });
    }

    // Save captain's original message
    db.data.matchMessages.push({
      id: uuidv4(),
      matchId: match.id,
      userId: user.id,
      userName: user.displayName || user.username,
      userRole: user.role,
      teamId: userTeamId || undefined,
      teamName: userTeamName || undefined,
      type: 'SCORE_SUBMISSION',
      message: trimmed,
      createdAt: isoNow
    });

    // Execute score calculation and submission
    const targetTeamId = isCaptainA ? match.teamAId! : isCaptainB ? match.teamBId! : match.teamAId!;
    const isSlotA = targetTeamId === match.teamAId;
    const targetTeamName = isSlotA ? match.teamAName : match.teamBName;

    const calculated = calculateRunScore({
      runnerKills: parsed.runnerKills,
      extractedCredits: parsed.extractedCredits,
      playersExtracted: parsed.playersExtracted,
      objectiveCompleted: parsed.objectiveCompleted
    });

    const submission: RunSubmission = {
      id: `sub-${uuidv4().slice(0, 8)}`,
      matchId: match.id,
      teamId: targetTeamId,
      runNumber: parsed.runNumber,
      ...calculated,
      submittedBy: user.id,
      submittedByName: user.displayName || user.username,
      submittedAt: isoNow,
      locked: true
    };

    db.data.runSubmissions.push(submission);

    if (isSlotA) {
      if (parsed.runNumber === 1) match.teamARun1 = submission;
      else match.teamARun2 = submission;
    } else {
      if (parsed.runNumber === 1) match.teamBRun1 = submission;
      else match.teamBRun2 = submission;
    }

    db.data.matchMessages.push({
      id: uuidv4(),
      matchId: match.id,
      userId: 'SYSTEM',
      userName: 'SYSTEM',
      userRole: 'SYSTEM',
      type: 'SYSTEM',
      message: `SYSTEM — RUN ${parsed.runNumber} SUBMITTED BY ${targetTeamName}\n${calculated.breakdownString}`,
      structuredScore: submission,
      createdAt: isoNow
    });

    // Phase transitions
    if (match.teamARun1 && match.teamBRun1 && !match.run1Revealed) {
      match.run1Revealed = true;
      match.matchStatus = 'RUN_1_COMPLETE';
    }

    if (match.teamARun1 && match.teamBRun1 && match.teamARun2 && match.teamBRun2) {
      match.matchStatus = 'RESULT_PENDING';
      match.disputeDeadlineAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      match.finalScoreA = Number((match.teamARun1.finalRunScore + match.teamARun2.finalRunScore).toFixed(2));
      match.finalScoreB = Number((match.teamBRun1.finalRunScore + match.teamBRun2.finalRunScore).toFixed(2));
    }

    match.updatedAt = isoNow;
    db.save();
    broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });

    return res.json({ success: true, message: 'Score command parsed and recorded.' });
  }

  // Normal Chat Message
  const newMsg: MatchMessage = {
    id: uuidv4(),
    matchId: match.id,
    userId: user.id,
    userName: user.displayName || user.username,
    userRole: user.role,
    teamId: userTeamId || undefined,
    teamName: userTeamName || undefined,
    type: isAdmin ? 'ADMIN' : 'CHAT',
    message: trimmed,
    createdAt: isoNow
  };

  db.data.matchMessages.push(newMsg);
  db.save();

  broadcastEvent('MESSAGE_POSTED', { matchId: match.id, message: newMsg });

  return res.json({ success: true, message: newMsg });
});

// Flag Result (Dispute Scoring Discrepancy)
router.post('/:id/flag-result', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const match = db.data.matches.find((m) => m.id === req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  const { runNumber, category, description, evidenceUrls } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Please provide a detailed explanation of the scoring discrepancy.' });
  }

  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const teamB = match.teamBId ? db.data.teams.find((t) => t.id === match.teamBId) : null;

  const isCaptainA = teamA?.captainUserId === user.id;
  const isCaptainB = teamB?.captainUserId === user.id;
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  if (!isCaptainA && !isCaptainB && !isAdmin) {
    return res.status(403).json({ error: 'Only the Team Captain may flag a match result.' });
  }

  const requestingTeamId = isCaptainA ? match.teamAId! : match.teamBId!;
  const requestingTeamName = isCaptainA ? match.teamAName! : match.teamBName!;
  const disputedTeamId = isCaptainA ? match.teamBId! : match.teamAId!;
  const disputedTeamName = isCaptainA ? match.teamBName! : match.teamAName!;

  const isoNow = new Date().toISOString();

  // Set match status to DISPUTED (Freezes auto-advancement)
  match.matchStatus = 'DISPUTED';
  match.updatedAt = isoNow;

  const dispute: MatchDispute = {
    id: `disp-${uuidv4().slice(0, 8)}`,
    matchId: match.id,
    requestingTeamId,
    requestingTeamName,
    disputedTeamId,
    disputedTeamName,
    runNumber: runNumber ? Number(runNumber) as 1 | 2 : undefined,
    category: category || 'Scoring Discrepancy',
    description: description.trim(),
    evidenceUrls: Array.isArray(evidenceUrls) ? evidenceUrls : evidenceUrls ? [evidenceUrls] : [],
    status: 'OPEN',
    createdAt: isoNow,
    updatedAt: isoNow
  };

  db.data.matchDisputes.push(dispute);

  // Also create AdminTicket
  const ticket: AdminTicket = {
    id: `tkt-${uuidv4().slice(0, 8)}`,
    matchId: match.id,
    tournamentId: match.tournamentId,
    requestingUserId: user.id,
    requestingUserName: user.displayName || user.username,
    requestingTeamId,
    requestingTeamName,
    category: `DISPUTE: ${category || 'Score Discrepancy'}`,
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
});

// Request Admin (Technical, Griefing, Disconnects, Cheating Accusations)
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

  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const teamB = match.teamBId ? db.data.teams.find((t) => t.id === match.teamBId) : null;

  const isCaptainA = teamA?.captainUserId === user.id;
  const isCaptainB = teamB?.captainUserId === user.id;

  const requestingTeamId = isCaptainA ? match.teamAId! : isCaptainB ? match.teamBId! : undefined;
  const requestingTeamName = isCaptainA ? match.teamAName! : isCaptainB ? match.teamBName! : undefined;

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

// Upload Evidence (VOD, Screenshot, Clip)
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

  const teamA = match.teamAId ? db.data.teams.find((t) => t.id === match.teamAId) : null;
  const isTeamA = match.teamAId ? db.data.teamMembers.some((m) => m.teamId === match.teamAId && m.userId === user.id) : false;

  const teamId = isTeamA ? match.teamAId! : match.teamBId!;
  const teamName = isTeamA ? match.teamAName! : match.teamBName!;

  const isoNow = new Date().toISOString();
  const evidence: MatchEvidence = {
    id: `ev-${uuidv4().slice(0, 8)}`,
    matchId: match.id,
    teamId,
    teamName,
    runNumber: runNumber ? Number(runNumber) as 1 | 2 : undefined,
    type: type || 'VOD',
    url: url.trim(),
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
