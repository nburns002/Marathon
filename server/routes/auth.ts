import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, generateToken, requireAuth } from '../middleware';
import { User, UserRecord, PublicUser, TeamSummary } from '../../src/types';
import { validateBungieIdFormat } from '../registrationService';

const router = Router();

function toPublicUser(u?: User | UserRecord | null): PublicUser | undefined {
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

// Register new user
router.post('/register', (req, res) => {
  const { email, username, displayName, bungieId, password } = req.body ?? {};

  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof username !== 'string' || !/^[a-zA-Z0-9_-]{3,32}$/.test(username.trim()) ||
      typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72 ||
      typeof bungieId !== 'string' || (displayName != null && (typeof displayName !== 'string' || displayName.length > 64))) {
    return res.status(400).json({ error: 'Enter a valid email, a 3–32 character username, a Bungie ID, and a password of at least 8 characters and at most 72 bytes.' });
  }

  const cleanBungieId = bungieId.trim();
  if (!validateBungieIdFormat(cleanBungieId)) {
    return res.status(400).json({
      error: 'Enter a Bungie ID such as DisplayName#1234.'
    });
  }

  const existingEmail = db.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
  if (existingEmail) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const existingUsername = db.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase().trim());
  if (existingUsername) {
    return res.status(400).json({ error: 'Username is already taken.' });
  }

  const isoNow = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, 8);

  const newUser: UserRecord = {
    id: `usr-${uuidv4().slice(0, 8)}`,
    email: email.trim().toLowerCase(),
    passwordHash,
    username: username.trim(),
    displayName: displayName?.trim() || username.trim(),
    bungieId: cleanBungieId,
    avatarUrl: '',
    role: 'PLAYER',
    accountStatus: 'ACTIVE',
    createdAt: isoNow,
    updatedAt: isoNow
  };

  db.data.users.push(newUser);

  db.data.auditLogs.push({
    id: uuidv4(),
    actorType: 'USER',
    actorId: newUser.id,
    actorName: newUser.username,
    action: 'USER_REGISTERED',
    entityType: 'USER',
    entityId: newUser.id,
    timestamp: isoNow
  });

  db.save();

  const token = generateToken(newUser);
  const { passwordHash: _, ...safeUser } = newUser;
  return res.json({ token, user: safeUser });
});

// Login
router.post('/login', (req, res) => {
  const { login, password } = req.body ?? {};
  if (typeof login !== 'string' || !login.trim() || login.length > 254 || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: 'Email or username and password are required.' });
  }

  const userRecord = db.data.users.find(
    (u) => u.email.toLowerCase() === login.toLowerCase().trim() || u.username.toLowerCase() === login.toLowerCase().trim()
  );

  if (!userRecord || !bcrypt.compareSync(password, userRecord.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  if (userRecord.accountStatus === 'SUSPENDED') {
    return res.status(403).json({ error: 'Account is suspended.' });
  }

  const token = generateToken(userRecord);
  const { passwordHash: _, ...safeUser } = userRecord;
  return res.json({ token, user: safeUser });
});

// Get Current User Profile + Enriched Teams
router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const userMemberships = db.data.teamMembers.filter((tm) => tm.userId === user.id && tm.membershipStatus === 'ACTIVE');
  const userTeamsRaw = db.data.teams.filter((t) => userMemberships.some((tm) => tm.teamId === t.id));

  // Enrich user teams with active members and captain details
  const enrichedTeams: TeamSummary[] = userTeamsRaw.map((team) => {
    const members = db.data.teamMembers
      .filter((tm) => tm.teamId === team.id && tm.membershipStatus === 'ACTIVE')
      .map((tm) => {
        const u = db.data.users.find((usr) => usr.id === tm.userId);
        return {
          ...tm,
          user: toPublicUser(u)
        };
      });

    const captain = db.data.users.find((u) => u.id === team.captainUserId);

    return {
      ...team,
      captain: toPublicUser(captain),
      members
    };
  });

  const invitations = db.data.teamInvitations.filter((inv) => inv.invitedUserId === user.id && inv.status === 'PENDING');
  const userNotifications = db.data.notifications.filter((n) => n.userId === user.id).slice(-20);

  return res.json({
    user,
    teams: enrichedTeams,
    primaryTeam: enrichedTeams[0] || null,
    invitations,
    notifications: userNotifications
  });
});

// Update Profile
router.put('/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { displayName, bungieId, avatarUrl } = req.body ?? {};
  if ((displayName !== undefined && (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 64)) ||
      (bungieId !== undefined && !validateBungieIdFormat(bungieId)) ||
      (avatarUrl !== undefined && (typeof avatarUrl !== 'string' || avatarUrl.length > 2048 ||
        (avatarUrl.trim() && !/^https:\/\//i.test(avatarUrl.trim()))))) {
    return res.status(400).json({ error: 'Enter a display name, a valid Bungie ID, and an optional HTTPS avatar URL.' });
  }

  const userRecord = db.data.users.find((u) => u.id === user.id)!;
  if (displayName !== undefined) user.displayName = userRecord.displayName = displayName.trim();
  if (avatarUrl !== undefined) user.avatarUrl = userRecord.avatarUrl = avatarUrl.trim();

  if (bungieId !== undefined && bungieId.trim() !== user.bungieId) {
    user.bungieId = userRecord.bungieId = bungieId.trim();

    db.data.auditLogs.push({
      id: uuidv4(),
      actorType: 'USER',
      actorId: user.id,
      actorName: user.username,
      action: 'BUNGIE_ID_UPDATED',
      entityType: 'USER',
      entityId: user.id,
      metadata: { newBungieId: user.bungieId },
      timestamp: new Date().toISOString()
    });
  }

  const isoNow = new Date().toISOString();
  user.updatedAt = isoNow;
  if (userRecord) userRecord.updatedAt = isoNow;
  db.save();

  return res.json({
    user,
    message: 'Profile updated. Note: Any active locked tournament rosters retain their snapshot Bungie ID.'
  });
});

// Demo persona switcher (Disabled in non-demo mode)
router.post('/switch-demo-user', (req, res) => {
  if (process.env.DEMO_MODE !== 'true') {
    return res.status(403).json({ error: 'Demo user impersonation is disabled in non-demo mode.' });
  }

  const { userId } = req.body;
  const userRecord = db.data.users.find((u) => u.id === userId);
  if (!userRecord) {
    return res.status(404).json({ error: 'Demo user not found.' });
  }

  const token = generateToken(userRecord);
  const { passwordHash: _, ...safeUser } = userRecord;
  return res.json({ token, user: safeUser });
});

export default router;
