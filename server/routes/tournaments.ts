import { Router, Response } from 'express';
import { getRegistrationCheckout, isConfirmedRegistration } from '../paymentService';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, requireAdmin, optionalAuth } from '../middleware';
import { generateSingleEliminationBracket, calculateTournamentCurrentRound, isDownstreamMatchMateriallyStarted } from '../bracket';
import { Tournament, TournamentRegistration, TournamentRegistrationDTO, TournamentDetailResponse } from '../../src/types';
import { broadcastEvent } from '../timerWorker';
import { validateTournamentRegistrationEligibility } from '../registrationService';
import { buildViewerContext, serializeMatchForViewer } from '../serializer';

const router = Router();

export function formatTournamentDTO(tournament: Tournament, registeredCount: number) {
  return {
    ...tournament,
    registeredCount,
    name: tournament.title,
    mapName: tournament.map,
    entryFeeUsd: tournament.entryFee,
    checkoutMode: getRegistrationCheckout(tournament.entryFee),
    prizePoolUsd: tournament.prizePool,
    currentTeamCount: registeredCount,
    startsAt: tournament.tournamentStartAt,
    scheduledStartTime: tournament.tournamentStartAt,
    readyCheckMinutes: tournament.readyWindowMinutes,
    headerImageUrl: tournament.bannerUrl || ''
  };
}

router.post('/', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { title, description, registrationCloseAt, tournamentStartAt, maxTeams, featuredObjectiveTitle,
    featuredObjectiveDescription, featuredObjectivePoints, prizePool } = req.body ?? {};
  const close = typeof registrationCloseAt === 'string' ? Date.parse(registrationCloseAt) : NaN;
  const start = typeof tournamentStartAt === 'string' ? Date.parse(tournamentStartAt) : NaN;
  const now = new Date();
  if (typeof title !== 'string' || !title.trim() || title.length > 100 ||
    typeof description !== 'string' || description.length > 2000 ||
    typeof featuredObjectiveTitle !== 'string' || !featuredObjectiveTitle.trim() || featuredObjectiveTitle.length > 100 ||
    typeof featuredObjectiveDescription !== 'string' || featuredObjectiveDescription.length > 1000 ||
    !Number.isInteger(featuredObjectivePoints) || featuredObjectivePoints < 0 || featuredObjectivePoints > 100 ||
    !Number.isInteger(maxTeams) || maxTeams < 2 || maxTeams > 64 ||
    !Number.isInteger(prizePool) || prizePool < 0 || prizePool > 1_000_000 ||
    !Number.isFinite(close) || !Number.isFinite(start) || close <= now.getTime() || start < close) {
    return res.status(400).json({ error: 'Check the title, schedule, team capacity, prize pool, and featured objective.' });
  }

  const timestamp = now.toISOString();
  const tournament: Tournament = {
    id: uuidv4(), title: title.trim(), description: description.trim(), map: 'Cryo Archive',
    format: '3-player Public-Lobby Score Race', runsPerMatch: 2, entryFee: 0, prizePool, maxTeams,
    featuredObjectiveTitle: featuredObjectiveTitle.trim(),
    featuredObjectiveDescription: featuredObjectiveDescription.trim(), featuredObjectivePoints,
    registrationOpenAt: timestamp, registrationCloseAt: new Date(close).toISOString(),
    tournamentStartAt: new Date(start).toISOString(), readyWindowMinutes: 10, matchWindowMinutes: 75,
    disputeWindowMinutes: 10, roundIntermissionMinutes: 10, status: 'REGISTRATION_OPEN', currentRound: 1,
    createdAt: timestamp, updatedAt: timestamp
  };
  db.data.tournaments.push(tournament);
  db.data.auditLogs.push({
    id: uuidv4(), actorType: 'ADMIN', actorId: req.user!.id, actorName: req.user!.username,
    action: 'TOURNAMENT_CREATED', entityType: 'TOURNAMENT', entityId: tournament.id,
    metadata: { maxTeams, registrationCloseAt: tournament.registrationCloseAt }, timestamp
  });
  db.save();
  broadcastEvent('TOURNAMENT_UPDATED', { tournamentId: tournament.id });
  return res.status(201).json({ tournament: formatTournamentDTO(tournament, 0) });
});

// GET /api/tournaments - Tournament List
router.get('/', (req, res) => {
  const tournamentsWithCounts = db.data.tournaments.map((t) => {
    const count = db.data.tournamentRegistrations.filter(
      (r) => r.tournamentId === t.id && isConfirmedRegistration(r)
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
    (r) => r.tournamentId === tournament.id && isConfirmedRegistration(r)
  );

  const bracket = db.data.brackets.find((b) => b.tournamentId === tournament.id);
  const rawMatches = db.data.matches.filter((m) => m.tournamentId === tournament.id);

  // Authoritatively sanitize bracket matches to prevent leaking hidden Run 1 statistics
  const sanitizedMatches = rawMatches.map((m) => {
    const viewerContext = buildViewerContext(req.user, m);
    return serializeMatchForViewer(m, viewerContext);
  });

  const enrichedRegistrations: TournamentRegistrationDTO[] = confirmedRegistrations.map((reg) => {
    const team = db.data.teams.find((t) => t.id === reg.teamId);
    const captainUser = db.data.users.find((u) => u.id === reg.captainUserId);
    const seed = bracket?.seeds ? (bracket.seeds[reg.teamId] ?? null) : null;
    return {
      ...reg,
      teamLogo: team?.logoUrl || '',
      captainName: captainUser?.displayName || captainUser?.username || 'Captain',
      seed
    };
  });

  const response: TournamentDetailResponse = {
    tournament: formatTournamentDTO(tournament, confirmedRegistrations.length),
    bracket: bracket ? { ...bracket, matches: sanitizedMatches } : null,
    registrations: enrichedRegistrations,
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
    (r) => r.tournamentId === tournament.id && isConfirmedRegistration(r)
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
  const { teamId } = req.body ?? {};

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
  const { teamId, termsAccepted, refundPolicyAccepted } = req.body ?? {};

  if (!teamId) {
    return res.status(400).json({ error: 'Please select a team to register.' });
  }

  if (termsAccepted !== true || refundPolicyAccepted !== true) {
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
  const checkout = getRegistrationCheckout(tournament.entryFee);
  if (checkout === 'UNAVAILABLE') {
    return res.status(409).json({ error: 'Paid registration is unavailable until a payment provider is configured.' });
  }
  const team = eligibility.team!;
  const rosterSnapshot = eligibility.rosterSnapshot!;
  const isoNow = new Date().toISOString();

  const registrationId = `reg-${uuidv4().slice(0, 8)}`;
  const newReg: TournamentRegistration = {
    id: registrationId,
    tournamentId: tournament.id,
    teamId: team.id,
    teamName: team.name,
    captainUserId: team.captainUserId,
    status: 'REGISTERED',
    paymentStatus: checkout,
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
    action: 'TOURNAMENT_REGISTERED',
    entityType: 'TOURNAMENT',
    entityId: tournament.id,
    metadata: {
      teamId: team.id,
      teamName: team.name,
      entryFee: tournament.entryFee,
      checkout
    },
    timestamp: isoNow
  });

  db.data.notifications.push({
    id: uuidv4(),
    userId: user.id,
    type: 'REGISTRATION_CONFIRMED',
    title: 'Tournament Registration Confirmed!',
    content: `Team ${team.name} has been successfully registered for "${tournament.title}".${checkout === 'SIMULATED' ? ' Checkout was simulated.' : ''}`,
    linkUrl: `/tournaments/${tournament.id}`,
    read: false,
    createdAt: isoNow
  });

  db.save();
  broadcastEvent('REGISTRY_UPDATED', { tournamentId: tournament.id });

  return res.json({
    success: true,
    registration: newReg,
    message: `Team ${team.name} successfully registered and entered into the Tournament Registry!${checkout === 'SIMULATED' ? ' Checkout was simulated.' : ''}`
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
  if (tournament.status === 'LIVE' && req.body?.allowPreStartReset !== true) {
    return res.status(400).json({
      error: 'Tournament is currently LIVE. Generating a new bracket requires an explicit pre-start reset parameter.'
    });
  }

  const confirmedRegistrations = db.data.tournamentRegistrations.filter(
    (r) => r.tournamentId === tournament.id && isConfirmedRegistration(r)
  );

  if (confirmedRegistrations.length < 2) {
    return res.status(400).json({
      error: `Cannot generate bracket with only ${confirmedRegistrations.length} team(s). At least 2 confirmed teams required.`
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
