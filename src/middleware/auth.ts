import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { platformSettings, users } from '../db/schema.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
export const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'babakunju900@gmail.com').toLowerCase();

export interface AuthenticatedUser {
  uid: string;
  email: string;
  username: string;
  role: 'user' | 'moderator' | 'broadcaster' | 'admin';
  status: 'active' | 'suspended' | 'blocked';
  subscriptionTier: 'free' | 'monthly' | 'yearly';
  provider: 'firebase' | 'local';
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(keyHex, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

export function createSessionToken(payload: { uid: string; email: string; role: string }): string {
  const data = {
    ...payload,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `ks_${encoded}.${sig}`;
}

export function verifySessionToken(token: string): { uid: string; email: string; role: string } | null {
  if (!token.startsWith('ks_')) return null;
  const raw = token.slice(3);
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return { uid: parsed.uid, email: parsed.email, role: parsed.role };
  } catch {
    return null;
  }
}

export async function getOrCreateDbUser(params: {
  uid: string;
  email: string;
  username?: string;
  avatarUrl?: string;
  phone?: string;
}) {
  const emailLower = (params.email || `${params.uid}@kinostage.local`).toLowerCase();
  const isInitialAdmin = emailLower === DEFAULT_ADMIN_EMAIL;
  try {
    const existing = await db.select().from(users).where(eq(users.uid, params.uid)).limit(1);
    if (existing.length > 0) {
      const current = existing[0];
      if (isInitialAdmin && current.role !== 'admin') {
        const updated = await db
          .update(users)
          .set({ role: 'admin' })
          .where(eq(users.uid, params.uid))
          .returning();
        return updated[0];
      }
      return current;
    }

    const inserted = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: emailLower,
        username: params.username || emailLower.split('@')[0] || 'Cinema Member',
        avatarUrl: params.avatarUrl || '',
        phone: params.phone || '',
        role: isInitialAdmin ? 'admin' : 'user',
        status: 'active',
        subscriptionTier: isInitialAdmin ? 'yearly' : 'free',
        preferredLanguages: ['English', 'Hindi', 'Malayalam'],
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email: emailLower },
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateDbUser:', error);
    throw new Error('User synchronization failed.', { cause: error });
  }
}

async function resolveTokenToUser(token: string): Promise<AuthenticatedUser | null> {
  // 1. Check server-issued local/admin/OTP session token
  if (token.startsWith('ks_')) {
    const verified = verifySessionToken(token);
    if (!verified) return null;
    const rows = await db.select().from(users).where(eq(users.uid, verified.uid)).limit(1);
    if (rows.length === 0) return null;
    const u = rows[0];
    if (u.status === 'blocked' || u.status === 'suspended') return null;
    return {
      uid: u.uid,
      email: u.email,
      username: u.username,
      role: u.role as AuthenticatedUser['role'],
      status: u.status as AuthenticatedUser['status'],
      subscriptionTier: u.subscriptionTier as AuthenticatedUser['subscriptionTier'],
      provider: 'local',
    };
  }

  // 2. Verify Firebase ID Token
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const dbUser = await getOrCreateDbUser({
      uid: decoded.uid,
      email: decoded.email || `${decoded.uid}@firebase.kinostage`,
      username: decoded.name || decoded.email?.split('@')[0] || 'Member',
      avatarUrl: decoded.picture || '',
    });
    if (dbUser.status === 'blocked' || dbUser.status === 'suspended') return null;
    return {
      uid: dbUser.uid,
      email: dbUser.email,
      username: dbUser.username,
      role: dbUser.role as AuthenticatedUser['role'],
      status: dbUser.status as AuthenticatedUser['status'],
      subscriptionTier: dbUser.subscriptionTier as AuthenticatedUser['subscriptionTier'],
      provider: 'firebase',
    };
  } catch {
    return null;
  }
}

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const user = await resolveTokenToUser(token);
        if (user) req.user = user;
      } catch (err) {
        console.error('optionalAuth error:', err);
      }
    }
  }
  next();
};

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  const token = authHeader.slice(7).trim();
  try {
    const user = await resolveTokenToUser(token);
    if (!user) {
      return res.status(401).json({ error: 'Session expired or unauthorized.' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    return res.status(401).json({ error: 'Unable to verify credentials.' });
  }
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  await requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Super Administrator privileges required.' });
    }
    next();
  });
};

export const requireBroadcaster = async (req: AuthRequest, res: Response, next: NextFunction) => {
  await requireAuth(req, res, () => {
    if (!req.user || !['admin', 'broadcaster', 'moderator'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Authorized broadcaster or administrator privileges required.' });
    }
    next();
  });
};

export async function getAdminBootstrapState() {
  const envConfigured = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
  try {
    const rows = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, 'admin_passcode_hash'))
      .limit(1);
    const claimedHash = (rows[0]?.valueJson?.hash as string | undefined) || null;
    return {
      envConfigured,
      claimed: Boolean(claimedHash),
      needsSetup: !envConfigured && !claimedHash,
      claimedHash,
    };
  } catch (error) {
    console.error('Failed to read admin bootstrap state:', error);
    return { envConfigured, claimed: false, needsSetup: !envConfigured, claimedHash: null };
  }
}
