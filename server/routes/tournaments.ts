import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, requireAdmin, optionalAuth } from '../middleware';
import { generateSingleEliminationBracket, calculateTournamentCurrentRound, isDownstreamMatchMateriallyStarted } from '../bracket';
import { TournamentRegistration, TournamentDetailResponse } from '../../src/types';
import { broadcastEvent } from '../timerWorker';
import { validateTournamentRegistrationEligibility } from '../registrationService';
import { buildViewerContext, serializeMatchForViewer } from '../serializer';

const router = Router();

export function formatTournamentDTO(tournament: any, registeredCount: number) {
  return {
    ...tournament,
    registeredCount,
    name: tournament.title,
    mapName: tournament.map,
    entryFeeUsd: tournament.entryFee,
    prizePoolUsd: tournament.prizePool,
    currentTeamCount: registeredCount,
    startsAt: tournament.tournamentStartAt,
    scheduledStartTime: tournament.tournamentStartAt,
    readyCheckMinutes: tournament.readyWindowMinutes,
    headerImageUrl: tournament.bannerUrl || ''
  };
}

// GET /api/tournaments - Tournament List
router.get('/', (req, res) => {
  const tournamentsWithCounts = db.data.tournaments.map((t) => {
    const count = db.data.tournamentRegistrations.filter(
      (r) => r.tournamentId === t.id && r.status === 'REGISTERED' && r.paymentStatus === 'PAID'
    ).length;
    return formatTournamentDTO(t, count);
  });
  return res.json({ tournaments: tournamentsWithCounts });
});

// GET /api/tournaments/:id - Tournament Details (Authoritative TournamentDetailResponse)
router.get('/:id', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const tournament = db.data.tournaments.find((t) => t.id === req.params.id);
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  const confirmedRegistrations = db.data.tournamentRegistrations.filter(
    (r) => r.tournamentId === tournament.id && r.status === 'REGISTERED' && r.paymentStatus === 'PAID'
  );

  const bracket = db.data.brackets.find((b) => b.tournamentId === tournament.id);
  const rawMatches = db.data.matches.filter((m) => m.tournamentId === tournament.id);

  // Authoritatively sanitize bracket matches to prevent leaking hidden Run 1 statistics
  const sanitizedMatches = rawMatches.map((m) => {
    const viewerContext = buildViewerContext(req.user, m);
    return serializeMatchForViewer(m, viewerContext);
  });

  const response: TournamentDetailResponse = {
    tournament: formatTournamentDTO(tournament, confirmedRegistrations.length),
    bracket: bracket ? { ...bracket, matches: sanitizedMatches } : null,
    registrations: confirmedRegistrations,
    registrationsCount: confirmedRegistrations.length
  };

  return res.json(response);
});

// GET /api/tournaments/:id/registry - Public Tournament Registry
router.get('/:id/registry', (req, res) => {
  const tournament = db.data.tournaments.find((t) => t.id === req.params.id);
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  const paidRegistrations = db.data.tournamentRegistrations.filter(
    (r) => r.tournamentId === tournament.id && r.status === 'REGISTERED' && r.paymentStatus === 'PAID'
  );

  const registryItems = paidRegistrations.map((reg) => {
    const team = db.data.teams.find((t) => t.id === reg.teamId);
    return {
      registrationId: reg.id,
      teamId: reg.teamId,
      teamName: reg.teamName,
      logoUrl: team?.logoUrl,
      registeredAt: reg.registeredAt,
      roster: reg.rosterSnapshot
    };
  });

  return res.json({
    tournamentId: tournament.id,
    tournamentTitle: tournament.title,
    count: registryItems.length,
    teams: registryItems
  });
});

// POST /api/tournaments/:id/join-check - Eligibility check using centralized validation service
router.post('/:id/join-check', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { teamId } = req.body;

  if (!teamId) {
    return res.status(400).json({ error: 'Please select a team to check registration eligibility.' });
  }

  const eligibility = validateTournamentRegistrationEligibility(req.params.id, teamId, user);
  if (!eligibility.eligible) {
    return res.status(400).json({ error: eligibility.error });
  }

  return res.json({
    eligible: true,
    team: {
      id: eligibility.team!.id,
      name: eligibility.team!.name,
      members: eligibility.rosterSnapshot
    },
    entryFee: eligibility.entryFee
  });
});

// Authoritative Registration & Payment Checkout Handler
function handleTournamentRegistration(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const tournamentId = req.params.id;
  const { teamId, termsAccepted, refundPolicyAccepted } = req.body;

  if (!teamId) {
    return res.status(400).json({ error: 'Please select a team to register.' });
  }

  if (!termsAccepted || !refundPolicyAccepted) {
    return res.status(400).json({
      error: 'You must affirm acceptance of the Tournament Rules, Terms of Service, and Refund Policy.'
    });
  }

  // Authoritative server-side eligibility check (never relies on client join-check)
  const eligibility = validateTournamentRegistrationEligibility(tournamentId, teamId, user);
  if (!eligibility.eligible) {
    return res.status(400).json({ error: eligibility.error });
  }

  const tournament = eligibility.tournament!;
  const team = eligibility.team!;
  const rosterSnapshot = eligibility.rosterSnapshot!;
  const isoNow = new Date().toISOString();

  const registrationId = `reg-${uuidv4().slice(0, 8)}`;
  const newReg: TournamentRegistration = {
    id: registrationId,
    tournamentId: tournament.id,
    teamId: team.id,
    teamName: team.name,
    captainUserId: user.id,
    status: 'REGISTERED',
    // In demo mode this is a simulated checkout transaction. If real payments are enabled,
    // PAID is only set upon webhook confirmation from the payment provider.
    paymentStatus: 'PAID',
    rosterSnapshot,
    registeredAt: isoNow,
    termsAcceptedAt: isoNow,
    refundPolicyAcceptedAt: isoNow
  };

  db.data.tournamentRegistrations.push(newReg);

  db.data.auditLogs.push({
    id: uuidv4(),
    actorType: 'USER',
    actorId: user.id,
    actorName: user.username,
    action: 'TOURNAMENT_PAID_AND_REGISTERED',
    entityType: 'TOURNAMENT',
    entityId: tournament.id,
    metadata: {
      teamId: team.id,
      teamName: team.name,
      entryFee: tournament.entryFee,
      isSimulatedPayment: true
    },
    timestamp: isoNow
  });

  db.data.notifications.push({
    id: uuidv4(),
    userId: user.id,
    type: 'REGISTRATION_CONFIRMED',
    title: 'Tournament Registration Confirmed!',
    content: `Team ${team.name} has been successfully registered for "${tournament.title}". Entry fee ($${tournament.entryFee}) processed (simulated demo mode).`,
    linkUrl: `/tournaments/${tournament.id}`,
    read: false,
    createdAt: isoNow
  });

  db.save();
  broadcastEvent('REGISTRY_UPDATED', { tournamentId: tournament.id });

  return res.json({
    success: true,
    registration: newReg,
    message: `Team ${team.name} successfully registered and entered into the Tournament Registry! (Payment Mode: Simulated Demo)`
  });
}

// Support BOTH canonical /register AND /checkout endpoints
router.post('/:id/register', requireAuth, handleTournamentRegistration);
router.post('/:id/checkout', requireAuth, handleTournamentRegistration);

// Authoritative Bracket Generation Handler
function handleGenerateBracket(req: AuthenticatedRequest, res: Response) {
  const tournament = db.data.tournaments.find((t) => t.id === req.params.id);
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  // 1. Bracket Protection: Check if any existing tournament match has materially started
  const existingMatches = db.data.matches.filter((m) => m.tournamentId === tournament.id);
  const activeOrStartedMatch = existingMatches.find((m) => isDownstreamMatchMateriallyStarted(m));
  if (activeOrStartedMatch) {
    return res.status(400).json({
      error: `Cannot generate or reset bracket: Match #${activeOrStartedMatch.matchNumber} (Round ${activeOrStartedMatch.round}) is already in progress (${activeOrStartedMatch.matchStatus}). Live matches cannot be silently deleted.`
    });
  }

  // 2. Reject ordinary regeneration once tournament is LIVE unless explicit pre-start reset flag is provided
  if (tournament.status === 'LIVE' && !req.body.allowPreStartReset) {
    return res.status(400).json({
      error: 'Tournament is currently LIVE. Generating a new bracket requires an explicit pre-start reset parameter.'
    });
  }

  const confirmedRegistrations = db.data.tournamentRegistrations.filter(
    (r) => r.tournamentId === tournament.id && r.status === 'REGISTERED' && r.paymentStatus === 'PAID'
  );

  if (confirmedRegistrations.length < 2) {
    return res.status(400).json({
      error: `Cannot generate bracket with only ${confirmedRegistrations.length} team(s). At least 2 paid teams required.`
    });
  }

  // Clean up any dependent records from unstarted previous matches to prevent orphans
  const matchIdsToRemove = new Set(existingMatches.map((m) => m.id));
  if (matchIdsToRemove.size > 0) {
    db.data.runSubmissions = db.data.runSubmissions.filter((r) => !matchIdsToRemove.has(r.matchId));
    db.data.matchMessages = db.data.matchMessages.filter((msg) => !matchIdsToRemove.has(msg.matchId));
    db.data.matchEvidence = db.data.matchEvidence.filter((ev) => !matchIdsToRemove.has(ev.matchId));
    db.data.matchDisputes = db.data.matchDisputes.filter((d) => !matchIdsToRemove.has(d.matchId));
    db.data.adminTickets = db.data.adminTickets.filter((tkt) => !tkt.matchId || !matchIdsToRemove.has(tkt.matchId));
  }

  db.data.matches = db.data.matches.filter((m) => m.tournamentId !== tournament.id);
  db.data.brackets = db.data.brackets.filter((b) => b.tournamentId !== tournament.id);

  const teamLookup: Record<string, { name: string; logoUrl?: string }> = {};
  db.data.teams.forEach((t) => {
    teamLookup[t.id] = { name: t.name, logoUrl: t.logoUrl };
  });

  const { bracket, matches, seedAudit } = generateSingleEliminationBracket(
    tournament.id,
    confirmedRegistrations,
    teamLookup,
    tournament.roundIntermissionMinutes || 10
  );

  // Initialize Round 1 ready check using configured readyWindowMinutes
  const isoNow = new Date().toISOString();
  const readyWindowMinutes = tournament.readyWindowMinutes || 10;
  const readyDeadline = new Date(Date.now() + readyWindowMinutes * 60 * 1000).toISOString();

  matches.forEach((m) => {
    if (m.round === 1 && !m.isBye && m.teamAId && m.teamBId) {
      m.matchStatus = 'READY_CHECK';
      m.readyDeadlineAt = readyDeadline;
    }
  });

  db.data.brackets.push(bracket);
  db.data.matches.push(...matches);

  tournament.status = 'LIVE';
  tournament.currentRound = calculateTournamentCurrentRound(matches, 1);
  tournament.updatedAt = isoNow;

  db.data.auditLogs.push({
    id: uuidv4(),
    actorType: 'ADMIN',
    actorId: req.user!.id,
    actorName: req.user!.username,
    action: 'BRACKET_GENERATED',
    entityType: 'TOURNAMENT',
    entityId: tournament.id,
    metadata: {
      teamCount: confirmedRegistrations.length,
      bracketSize: bracket.bracketSize,
      totalRounds: bracket.totalRounds,
      seedAudit
    },
    timestamp: isoNow
  });

  db.save();
  broadcastEvent('BRACKET_GENERATED', { tournamentId: tournament.id });

  return res.json({
    success: true,
    bracket,
    matches,
    seedAudit,
    message: `Random bracket generated for ${confirmedRegistrations.length} teams (${bracket.bracketSize}-position bracket). Tournament is now LIVE.`
  });
}

// Support BOTH canonical /generate-bracket AND /lock-and-generate-bracket
router.post('/:id/generate-bracket', requireAuth, requireAdmin, handleGenerateBracket);
router.post('/:id/lock-and-generate-bracket', requireAuth, requireAdmin, handleGenerateBracket);

export default router;
