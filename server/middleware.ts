import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { User } from '../src/types';

export function getJwtSecret(): string {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true') {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || secret === 'marathon_tournament_platform_jwt_secret_2026') {
      throw new Error('FATAL: Non-demo deployments require a secure JWT_SECRET environment variable with at least 32 characters.');
    }
    return secret;
  }
  return process.env.JWT_SECRET || 'marathon_tournament_platform_jwt_secret_2026';
}

const JWT_SECRET = getJwtSecret();

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function generateToken(user: { id: string; email: string; username: string; role: any }): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    const userRecord = db.data.users.find((u) => u.id === decoded.id);

    if (!userRecord || userRecord.accountStatus === 'SUSPENDED') {
      return res.status(401).json({ error: 'Account not found or suspended.' });
    }

    const { passwordHash: _, ...safeUser } = userRecord;
    req.user = safeUser;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
      const userRecord = db.data.users.find((u) => u.id === decoded.id);
      if (userRecord && userRecord.accountStatus !== 'SUSPENDED') {
        const { passwordHash: _, ...safeUser } = userRecord;
        req.user = safeUser;
      }
    } catch {
      // ignore
    }
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'SUPERADMIN')) {
    return res.status(403).json({ error: 'Administrative privileges required.' });
  }
  next();
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Superadmin privileges required.' });
  }
  next();
}
