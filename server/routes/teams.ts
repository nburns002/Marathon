import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth, optionalAuth } from '../middleware';
import { TeamMember, TeamInvitation, PublicUser } from '../../src/types';
import { buildViewerContext, serializeMatchForViewer } from '../serializer';
import { normalizeBungieId } from '../registrationService';

const router = Router();

function toPublicUser(u?: { id: string; username: string; displayName: string; bungieId: string; avatarUrl: string; role: any } | null): PublicUser | undefined {
  if (!u) return undefined;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    bungieId: u.bungieId,
    avatarUrl: u.avatarUrl,
    role: u.role
  };
}

// List all teams
router.get('/', (req, res) => {
  const teamsWithDetails = db.data.teams.map((team) => {
    const members = db.data.teamMembers
      .filter((tm) => tm.teamId === team.id && tm.membershipStatus === 'ACTIVE')
      .map((tm) => {
        const u = db.data.users.find((user) => user.id === tm.userId);
        return {
          ...tm,
          user: toPublicUser(u)
        };
      });

    const captain = db.data.users.find((u) => u.id === team.captainUserId);

    // Calculate match stats
    const matches = db.data.matches.filter(
      (m) => (m.teamAId === team.id || m.teamBId === team.id) && m.matchStatus === 'FINAL'
    );
    const won = matches.filter((m) => m.winnerTeamId === team.id).length;
    const lost = matches.length - won;
    const championships = db.data.tournaments.filter((t) => t.championTeamId === team.id).length;

    return {
      ...team,
      captain: toPublicUser(captain),
      members,
      stats: {
        tournamentsPlayed: db.data.tournamentRegistrations.filter((r) => r.teamId === team.id && r.status === 'REGISTERED').length,
        matchesWon: won,
        matchesLost: lost,
        championships
      }
    };
  });

  return res.json({ teams: teamsWithDetails });
});

// Get team by ID with sanitized match history and privacy protection
router.get('/:id', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const team = db.data.teams.find((t) => t.id === req.params.id);
  if (!team) {
    return res.status(404).json({ error: 'Team not found.' });
  }

  const members = db.data.teamMembers
    .filter((tm) => tm.teamId === team.id && tm.membershipStatus === 'ACTIVE')
    .map((tm) => {
      const u = db.data.users.find((user) => user.id === tm.userId);
      return {
        ...tm,
        user: toPublicUser(u)
      };
    });

  const captain = db.data.users.find((u) => u.id === team.captainUserId);

  const teamRegistrations = db.data.tournamentRegistrations.filter((r) => r.teamId === team.id && r.status === 'REGISTERED');
  const rawMatches = db.data.matches.filter((m) => m.teamAId === team.id || m.teamBId === team.id);

  // Authoritatively sanitize team match history so unrevealed Run 1 data cannot leak here
  const sanitizedMatches = rawMatches.map((m) => {
    const viewerContext = buildViewerContext(req.user, m);
    return serializeMatchForViewer(m, viewerContext);
  });

  return res.json({
    team: {
      ...team,
      captain: toPublicUser(captain),
      members,
      registrations: teamRegistrations,
      matches: sanitizedMatches
    }
  });
});

// Search users for invite
router.get('/search/users', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const q = ((req.query.q as string) || '').toLowerCase().trim();
  if (!q) {
    return res.json({ users: [] });
  }

  const users = db.data.users
    .filter(
      (u) =>
        u.id !== req.user!.id &&
        (u.username.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.bungieId.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q))
    )
    .slice(0, 10)
    .map((u) => toPublicUser(u));

  return res.json({ users });
});

// Create a new team
router.post('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { name, tag, logoUrl } = req.body;

  if (!name || !tag) {
    return res.status(400).json({ error: 'Team name and tag (2-4 uppercase characters) are required.' });
  }

  const cleanName = name.trim();
  const cleanTag = tag.trim().toUpperCase();

  if (cleanTag.length < 2 || cleanTag.length > 5) {
    return res.status(400).json({ error: 'Team tag must be between 2 and 5 characters.' });
  }

  const existingName = db.data.teams.find((t) => t.name.toLowerCase() === cleanName.toLowerCase());
  if (existingName) {
    return res.status(400).json({ error: 'A team with this name already exists.' });
  }

  const isoNow = new Date().toISOString();
  const newTeam = {
    id: `team-${uuidv4().slice(0, 8)}`,
    name: cleanName,
    tag: cleanTag,
    logoUrl: logoUrl || `https://images.unsplash.com/photo-1542751371-adc38448a05e?w=128&auto=format&fit=crop&q=80`,
    captainUserId: user.id,
    createdAt: isoNow
  };

  db.data.teams.push(newTeam);

  // Add captain as first team member
  const captainMember: TeamMember = {
    id: `tm-${uuidv4().slice(0, 8)}`,
    teamId: newTeam.id,
    userId: user.id,
    role: 'CAPTAIN',
    membershipStatus: 'ACTIVE',
    joinedAt: isoNow
  };
  db.data.teamMembers.push(captainMember);

  if (user.role === 'PLAYER') {
    user.role = 'CAPTAIN';
  }

  db.data.auditLogs.push({
    id: uuidv4(),
    actorType: 'USER',
    actorId: user.id,
    actorName: user.username,
    action: 'TEAM_CREATED',
    entityType: 'TEAM',
    entityId: newTeam.id,
    metadata: { name: newTeam.name },
    timestamp: isoNow
  });

  db.save();
  return res.status(201).json({ team: newTeam });
});

// Send team invitation (Supports explicit targetUserId OR identifier resolver)
router.post('/:id/invite', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const team = db.data.teams.find((t) => t.id === req.params.id);

  if (!team) {
    return res.status(404).json({ error: 'Team not found.' });
  }

  if (team.captainUserId !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Only the team captain can send invitations.' });
  }

  const activeMembers = db.data.teamMembers.filter((tm) => tm.teamId === team.id && tm.membershipStatus === 'ACTIVE');
  if (activeMembers.length >= 3) {
    return res.status(400).json({ error: 'Team already has the maximum of 3 active players.' });
  }

  const { targetUserId, identifier } = req.body;

  let targetUser = null;
  if (targetUserId) {
    targetUser = db.data.users.find((u) => u.id === targetUserId);
  } else if (identifier && typeof identifier === 'string') {
    const rawId = identifier.trim();
    const normBungie = normalizeBungieId(rawId);
    targetUser = db.data.users.find(
      (u) =>
        u.id === rawId ||
        u.username.toLowerCase() === rawId.toLowerCase() ||
        u.email.toLowerCase() === rawId.toLowerCase() ||
        normalizeBungieId(u.bungieId) === normBungie
    );
  }

  if (!targetUser) {
    return res.status(404).json({
      error: 'Target player not found. Please ensure the user has created an account before inviting them.'
    });
  }

  const alreadyMember = activeMembers.some((m) => m.userId === targetUser!.id);
  if (alreadyMember) {
    return res.status(400).json({ error: `${targetUser.username} is already an active member of this team.` });
  }

  const pendingInvite = db.data.teamInvitations.find(
    (inv) => inv.teamId === team.id && inv.invitedUserId === targetUser!.id && inv.status === 'PENDING'
  );
  if (pendingInvite) {
    return res.status(400).json({ error: 'An invitation is already pending for this player.' });
  }

  const isoNow = new Date().toISOString();
  const invitation: TeamInvitation = {
    id: `inv-${uuidv4().slice(0, 8)}`,
    teamId: team.id,
    teamName: team.name,
    captainName: user.displayName || user.username,
    invitedUserId: targetUser.id,
    invitedByUserId: user.id,
    status: 'PENDING',
    createdAt: isoNow
  };

  db.data.teamInvitations.push(invitation);

  db.data.notifications.push({
    id: uuidv4(),
    userId: targetUser.id,
    type: 'TEAM_INVITE',
    title: `Team Invitation from ${team.name}`,
    content: `${user.displayName} invited you to join team ${team.name} for competitive Marathon tournaments.`,
    linkUrl: `/teams/${team.id}`,
    read: false,
    createdAt: isoNow
  });

  db.save();
  return res.json({ invitation, message: `Invitation sent to ${targetUser.username}.` });
});

// Respond to invitation (ACCEPT / DECLINE)
router.post('/invitations/:id/respond', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const invitation = db.data.teamInvitations.find((inv) => inv.id === req.params.id);

  if (!invitation || invitation.invitedUserId !== user.id) {
    return res.status(404).json({ error: 'Invitation not found.' });
  }

  if (invitation.status !== 'PENDING') {
    return res.status(400).json({ error: `Invitation has already been ${invitation.status.toLowerCase()}.` });
  }

  const { action } = req.body;
  const isoNow = new Date().toISOString();

  if (action === 'ACCEPT') {
    const activeMembers = db.data.teamMembers.filter((tm) => tm.teamId === invitation.teamId && tm.membershipStatus === 'ACTIVE');
    if (activeMembers.length >= 3) {
      return res.status(400).json({ error: 'This team has already reached the maximum 3-player roster capacity.' });
    }

    invitation.status = 'ACCEPTED';

    const newMember: TeamMember = {
      id: `tm-${uuidv4().slice(0, 8)}`,
      teamId: invitation.teamId,
      userId: user.id,
      role: 'MEMBER',
      membershipStatus: 'ACTIVE',
      joinedAt: isoNow
    };
    db.data.teamMembers.push(newMember);

    const team = db.data.teams.find((t) => t.id === invitation.teamId);
    if (team) {
      db.data.notifications.push({
        id: uuidv4(),
        userId: team.captainUserId,
        type: 'INVITE_ACCEPTED',
        title: 'Team Invitation Accepted',
        content: `${user.displayName} accepted your invitation to join ${team.name}.`,
        linkUrl: `/teams/${team.id}`,
        read: false,
        createdAt: isoNow
      });
    }

    db.save();
    return res.json({ success: true, message: `You have joined ${invitation.teamName}.` });
  } else {
    invitation.status = 'DECLINED';
    db.save();
    return res.json({ success: true, message: 'Invitation declined.' });
  }
});

export default router;
