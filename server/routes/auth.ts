import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { AuthenticatedRequest, generateToken, requireAuth } from '../middleware';
import { User } from '../../src/types';

const router = Router();

// Register new user
router.post('/register', (req, res) => {
  const { email, username, displayName, bungieId, password } = req.body;

  if (!email || !username || !password || !bungieId) {
    return res.status(400).json({ error: 'Email, username, Bungie ID, and password are required.' });
  }

  const existingEmail = db.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existingEmail) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const existingUsername = db.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (existingUsername) {
    return res.status(400).json({ error: 'Username is already taken.' });
  }

  const isoNow = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, 8);

  const newUser: User = {
    id: `usr-${uuidv4().slice(0, 8)}`,
    email: email.trim().toLowerCase(),
    passwordHash,
    username: username.trim(),
    displayName: displayName?.trim() || username.trim(),
    bungieId: bungieId.trim(),
    avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username.trim())}`,
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
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Email or username and password are required.' });
  }

  const user = db.data.users.find(
    (u) => u.email.toLowerCase() === login.toLowerCase() || u.username.toLowerCase() === login.toLowerCase()
  );

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  if (user.accountStatus === 'SUSPENDED') {
    return res.status(403).json({ error: 'Account is suspended.' });
  }

  const token = generateToken(user);
  const { passwordHash: _, ...safeUser } = user;
  return res.json({ token, user: safeUser });
});

// Get Current User Profile + Team
router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const userMemberships = db.data.teamMembers.filter((tm) => tm.userId === user.id && tm.membershipStatus === 'ACTIVE');
  const userTeams = db.data.teams.filter((t) => userMemberships.some((tm) => tm.teamId === t.id));
  const invitations = db.data.teamInvitations.filter((inv) => inv.invitedUserId === user.id && inv.status === 'PENDING');
  const userNotifications = db.data.notifications.filter((n) => n.userId === user.id).slice(-20);

  const { passwordHash: _, ...safeUser } = user;

  return res.json({
    user: safeUser,
    teams: userTeams,
    primaryTeam: userTeams[0] || null,
    invitations,
    notifications: userNotifications
  });
});

// Update Profile
router.put('/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { displayName, bungieId, avatarUrl } = req.body;

  if (displayName) user.displayName = displayName.trim();
  if (avatarUrl) user.avatarUrl = avatarUrl.trim();

  // Roster Lock notice on Bungie ID edit
  if (bungieId && bungieId.trim() !== user.bungieId) {
    user.bungieId = bungieId.trim();

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

  user.updatedAt = new Date().toISOString();
  db.save();

  const { passwordHash: _, ...safeUser } = user;
  return res.json({
    user: safeUser,
    message: 'Profile updated. Note: Any active locked tournament rosters retain their snapshot Bungie ID.'
  });
});

// Quick persona switcher for live scenario verification
router.post('/switch-demo-user', (req, res) => {
  const { userId } = req.body;
  const user = db.data.users.find((u) => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'Demo user not found.' });
  }

  const token = generateToken(user);
  const { passwordHash: _, ...safeUser } = user;
  return res.json({ token, user: safeUser });
});

export default router;
