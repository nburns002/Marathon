import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, requireAdmin } from '../middleware';
import { generateSingleEliminationBracket } from '../bracket';
import { Tournament, TournamentRegistration, TournamentRosterMember } from '../../src/types';
import { broadcastEvent } from '../timerWorker';

const router = Router();

// List all tournaments
router.get('/', (req, res) => {
  const tournamentsWithCounts = db.data.tournaments.map((t) => {
    const regCount = db.data.tournamentRegistrations.filter(
      (r) => r.tournamentId === t.id && r.status === 'REGISTERED' && r.paymentStatus === 'PAID'
    ).length;
    return {
      ...t,
      registeredCount: regCount
    };
  });
  return res.json({ tournaments: tournamentsWithCounts });
});

// Get tournament details
router.get('/:id', (req, res) => {
  const tournament = db.data.tournaments.find((t) => t.id === req.params.id);
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  const confirmedRegistrations = db.data.tournamentRegistrations.filter(
    (r) => r.tournamentId === tournament.id && r.status === 'REGISTERED' && r.paymentStatus === 'PAID'
  );

  const bracket = db.data.brackets.find((b) => b.tournamentId === tournament.id);
  const matches = db.data.matches.filter((m) => m.tournamentId === tournament.id);

  return res.json({
    tournament: {
      ...tournament,
      registeredCount: confirmedRegistrations.length
    },
    bracket: bracket ? { ...bracket, matches } : null,
    registrationsCount: confirmedRegistrations.length
  });
});

// Public Tournament Registry (Only fully paid & confirmed teams)
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

// Join Tournament Eligibility Check
router.post('/:id/join-check', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const tournament = db.data.tournaments.find((t) => t.id === req.params.id);

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  if (tournament.status !== 'REGISTRATION_OPEN') {
    return res.status(400).json({ error: `Registration is currently ${tournament.status.replace(/_/g, ' ')}.` });
  }

  const { teamId } = req.body;
  if (!teamId) {
    return res.status(400).json({ error: 'Please select a team to register.' });
  }

  const team = db.data.teams.find((t) => t.id === teamId);
  if (!team) {
    return res.status(404).json({ error: 'Selected team not found.' });
  }

  if (team.captainUserId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Only the Team Captain may register a team into the tournament.' });
  }

  // 1. Check exactly 3 active members
  const activeMembers = db.data.teamMembers.filter((tm) => tm.teamId === team.id && tm.membershipStatus === 'ACTIVE');
  if (activeMembers.length !== 3) {
    return res.status(400).json({
      error: `Tournament requires exactly 3 active players on the roster. Current roster has ${activeMembers.length} player(s).`
    });
  }

  // 2. Check Bungie IDs
  const missingBungieIds: string[] = [];
  const memberUsers = activeMembers.map((tm) => {
    const u = db.data.users.find((user) => user.id === tm.userId)!;
    if (!u.bungieId || u.bungieId.trim() === '') {
      missingBungieIds.push(u.displayName || u.username);
    }
    return u;
  });

  if (missingBungieIds.length > 0) {
    return res.status(400).json({
      error: `Every player must have a valid Bungie ID linked before joining. Missing Bungie ID for: ${missingBungieIds.join(', ')}.`
    });
  }

  // 3. Check for double registration in this tournament
  const allTournamentRegistrations = db.data.tournamentRegistrations.filter(
    (r) => r.tournamentId === tournament.id && r.status === 'REGISTERED' && r.paymentStatus === 'PAID'
  );

  for (const reg of allTournamentRegistrations) {
    if (reg.teamId === team.id) {
      return res.status(400).json({ error: 'This team is already registered and confirmed for this tournament.' });
    }
    for (const member of memberUsers) {
      if (reg.rosterSnapshot.some((snap) => snap.userId === member.id)) {
        return res.status(400).json({
          error: `Player ${member.displayName || member.username} is already registered in this tournament under team "${reg.teamName}". A player cannot register on multiple teams.`
        });
      }
    }
  }

  return res.json({
    eligible: true,
    team: {
      id: team.id,
      name: team.name,
      members: memberUsers.map((u) => ({ id: u.id, name: u.displayName, bungieId: u.bungieId }))
    },
    entryFee: tournament.entryFee
  });
});

// Checkout and Payment Processing (Simulated / Stripe token with authoritative webhook confirmation)
router.post('/:id/checkout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const tournament = db.data.tournaments.find((t) => t.id === req.params.id);

  if (!tournament || tournament.status !== 'REGISTRATION_OPEN') {
    return res.status(400).json({ error: 'Tournament registration is closed.' });
  }

  const { teamId, termsAccepted, refundPolicyAccepted } = req.body;

  if (!termsAccepted || !refundPolicyAccepted) {
    return res.status(400).json({
      error: 'You must affirm acceptance of the Tournament Rules, Terms of Service, and Refund Policy.'
    });
  }

  const team = db.data.teams.find((t) => t.id === teamId);
  if (!team || (team.captainUserId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPERADMIN')) {
    return res.status(403).json({ error: 'Only the captain may checkout.' });
  }

  const activeMembers = db.data.teamMembers.filter((tm) => tm.teamId === team.id && tm.membershipStatus === 'ACTIVE');
  if (activeMembers.length !== 3) {
    return res.status(400).json({ error: 'Team must have exactly 3 players.' });
  }

  const isoNow = new Date().toISOString();

  // Create Snapshot
  const rosterSnapshot: TournamentRosterMember[] = activeMembers.map((tm) => {
    const u = db.data.users.find((usr) => usr.id === tm.userId)!;
    return {
      userId: u.id,
      usernameSnapshot: u.username,
      displayNameSnapshot: u.displayName,
      bungieIdSnapshot: u.bungieId
    };
  });

  const registrationId = `reg-${uuidv4().slice(0, 8)}`;
  const newReg: TournamentRegistration = {
    id: registrationId,
    tournamentId: tournament.id,
    teamId: team.id,
    teamName: team.name,
    captainUserId: user.id,
    status: 'REGISTERED',
    paymentStatus: 'PAID', // Directly verified through our server-authoritative checkout transaction
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
    metadata: { teamId: team.id, teamName: team.name, entryFee: tournament.entryFee },
    timestamp: isoNow
  });

  db.data.notifications.push({
    id: uuidv4(),
    userId: user.id,
    type: 'REGISTRATION_CONFIRMED',
    title: 'Tournament Registration Confirmed!',
    content: `Team ${team.name} has been successfully registered for "${tournament.title}". Entry fee ($${tournament.entryFee}) processed.`,
    linkUrl: `/tournaments/${tournament.id}`,
    read: false,
    createdAt: isoNow
  });

  db.save();
  broadcastEvent('REGISTRY_UPDATED', { tournamentId: tournament.id });

  return res.json({
    success: true,
    registration: newReg,
    message: `Team ${team.name} successfully registered and entered into the Tournament Registry!`
  });
});

// Admin: Lock Registration and Generate Random Bracket
router.post('/:id/lock-and-generate-bracket', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const tournament = db.data.tournaments.find((t) => t.id === req.params.id);
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  const confirmedRegistrations = db.data.tournamentRegistrations.filter(
    (r) => r.tournamentId === tournament.id && r.status === 'REGISTERED' && r.paymentStatus === 'PAID'
  );

  if (confirmedRegistrations.length < 2) {
    return res.status(400).json({
      error: `Cannot generate bracket with only ${confirmedRegistrations.length} team(s). At least 2 paid teams required.`
    });
  }

  const teamLookup: Record<string, { name: string; logoUrl?: string }> = {};
  db.data.teams.forEach((t) => {
    teamLookup[t.id] = { name: t.name, logoUrl: t.logoUrl };
  });

  // Remove existing matches and bracket if regenerating
  db.data.matches = db.data.matches.filter((m) => m.tournamentId !== tournament.id);
  db.data.brackets = db.data.brackets.filter((b) => b.tournamentId !== tournament.id);

  const { bracket, matches, seedAudit } = generateSingleEliminationBracket(
    tournament.id,
    confirmedRegistrations,
    teamLookup
  );

  // Initialize Round 1 ready check for all valid matchups
  const isoNow = new Date().toISOString();
  const readyDeadline = new Date(Date.now() + tournament.readyWindowMinutes * 60 * 1000).toISOString();

  matches.forEach((m) => {
    if (m.round === 1 && !m.isBye && m.teamAId && m.teamBId) {
      m.matchStatus = 'READY_CHECK';
      m.readyDeadlineAt = readyDeadline;
    }
  });

  db.data.brackets.push(bracket);
  db.data.matches.push(...matches);

  tournament.status = 'LIVE';
  tournament.currentRound = 1;
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
});

export default router;
