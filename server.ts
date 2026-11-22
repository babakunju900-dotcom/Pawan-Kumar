import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { WebSocketServer, WebSocket } from 'ws';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  adminActivityLogs,
  copyrightReports,
  episodes,
  liveChannels,
  liveChatMessages,
  liveEvents,
  livePolls,
  notifications,
  platformSettings,
  realityCameras,
  realityEpisodes,
  realityParticipants,
  realityShows,
  reviews,
  seasons,
  studioStreams,
  subscriptionPlans,
  titles,
  transactions,
  users,
  watchHistory,
  watchlist,
  youtubeImports,
} from './src/db/schema.ts';
import { ensureDatabaseSeeded } from './src/db/seed.ts';
import {
  createSessionToken,
  DEFAULT_ADMIN_EMAIL,
  getAdminBootstrapState,
  getOrCreateDbUser,
  hashPassword,
  optionalAuth,
  requireAdmin,
  requireAuth,
  requireBroadcaster,
  verifyPassword,
  type AuthRequest,
} from './src/middleware/auth.ts';
import { fetchYouTubeMoviePreview } from './src/services/youtubeImport.ts';
import { runAdminAiTask } from './src/lib/gemini.ts';
import { computeRecommendations, extractYouTubeVideoId, isSafeMediaUrl, maskStreamKey, slugify } from './src/utils/ott.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Short-lived in-memory OTP store (server-side only, 5-minute TTL)
const otpStore = new Map<string, { code: string; expiresAt: number }>();

async function logAdminAction(
  adminEmail: string,
  action: string,
  targetType: string,
  targetId = '',
  details = ''
) {
  try {
    await db.insert(adminActivityLogs).values({
      adminEmail,
      action,
      targetType,
      targetId: String(targetId),
      details,
    });
  } catch (err) {
    console.error('Failed to record admin audit log:', err);
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  // Rate limiters
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 180,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down briefly.' },
  });
  const sensitiveLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit reached for this operation. Try again in a minute.' },
  });

  app.use('/api', apiLimiter);

  // Lazy seed middleware on first API call (no eager startup probe)
  app.use('/api', async (_req, res, next) => {
    try {
      await ensureDatabaseSeeded();
      next();
    } catch (error) {
      console.error('Lazy seed middleware error:', error);
      res.status(503).json({ error: 'Database is initializing. Please retry in a moment.' });
    }
  });

  const server = http.createServer(app);

  // Real-time WebSocket hub for Live Chat, Reactions, Polls, Viewers & Push Notifications
  const wss = new WebSocketServer({ noServer: true });
  const roomClients = new Map<string, Set<WebSocket>>();
  const wsMeta = new Map<WebSocket, { roomId: string; userUid: string; username: string; lastMsgAt: number }>();

  function broadcastToRoom(roomId: string, event: Record<string, unknown>) {
    const clients = roomClients.get(roomId);
    if (!clients) return;
    const payload = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  function broadcastGlobal(event: Record<string, unknown>) {
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as {
          type: string;
          roomId?: string;
          userUid?: string;
          username?: string;
          userRole?: string;
          message?: string;
          emoji?: string;
        };

        if (data.type === 'room:join' && data.roomId) {
          const roomId = String(data.roomId).slice(0, 64);
          const prev = wsMeta.get(ws);
          if (prev && roomClients.has(prev.roomId)) {
            roomClients.get(prev.roomId)!.delete(ws);
          }
          if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
          roomClients.get(roomId)!.add(ws);
          wsMeta.set(ws, {
            roomId,
            userUid: String(data.userUid || 'guest').slice(0, 80),
            username: String(data.username || 'Viewer').slice(0, 40),
            lastMsgAt: 0,
          });
          broadcastToRoom(roomId, {
            type: 'presence:update',
            roomId,
            connectedCount: roomClients.get(roomId)!.size,
          });
          return;
        }

        const meta = wsMeta.get(ws);
        if (!meta) return;

        if (data.type === 'reaction:send' && data.emoji) {
          const allowedEmojis = ['🔥', '❤️', '👏', '😮', '🎬', '⚡'];
          if (allowedEmojis.includes(data.emoji)) {
            broadcastToRoom(meta.roomId, {
              type: 'reaction:received',
              emoji: data.emoji,
              username: meta.username,
              id: crypto.randomUUID(),
            });
          }
          return;
        }

        if (data.type === 'chat:send' && data.message) {
          const cleanMsg = String(data.message).trim().slice(0, 320);
          if (!cleanMsg) return;

          // Enforce server chat moderation controls
          const [controlsRow] = await db
            .select()
            .from(platformSettings)
            .where(eq(platformSettings.key, 'chat_controls'))
            .limit(1);
          const controls = (controlsRow?.valueJson || {}) as {
            slowModeSeconds?: number;
            chatDisabled?: boolean;
            blockedUids?: string[];
          };

          if (controls.chatDisabled) {
            ws.send(JSON.stringify({ type: 'chat:error', error: 'Live chat is temporarily disabled by moderators.' }));
            return;
          }
          if (Array.isArray(controls.blockedUids) && controls.blockedUids.includes(meta.userUid)) {
            ws.send(JSON.stringify({ type: 'chat:error', error: 'You have been muted in this live chat.' }));
            return;
          }
          const slowSec = Number(controls.slowModeSeconds || 0);
          if (slowSec > 0 && Date.now() - meta.lastMsgAt < slowSec * 1000) {
            ws.send(JSON.stringify({ type: 'chat:error', error: `Slow mode active (${slowSec}s between messages).` }));
            return;
          }
          meta.lastMsgAt = Date.now();

          const [saved] = await db
            .insert(liveChatMessages)
            .values({
              roomId: meta.roomId,
              userUid: meta.userUid,
              username: String(data.username || meta.username).slice(0, 40),
              userRole: data.userRole === 'admin' || data.userRole === 'moderator' ? data.userRole : 'user',
              message: cleanMsg,
            })
            .returning();

          broadcastToRoom(meta.roomId, {
            type: 'chat:message',
            message: saved,
          });
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      const meta = wsMeta.get(ws);
      if (meta && roomClients.has(meta.roomId)) {
        roomClients.get(meta.roomId)!.delete(ws);
        broadcastToRoom(meta.roomId, {
          type: 'presence:update',
          roomId: meta.roomId,
          connectedCount: roomClients.get(meta.roomId)!.size,
        });
      }
      wsMeta.delete(ws);
    });
  });

  // =========================================================================
  // HEALTH & INTEGRATIONS STATUS
  // =========================================================================
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'KinoStage OTT API', timestamp: new Date().toISOString() });
  });

  app.get('/api/setup/status', (_req, res) => {
    res.json({
      cloudSql: Boolean(process.env.SQL_HOST && process.env.SQL_DB_NAME),
      firebaseAuth: true,
      geminiAi: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      youtubeDataApi: Boolean(process.env.YOUTUBE_API_KEY),
      tmdbApi: Boolean(process.env.TMDB_API_KEY),
      paymentGateway: Boolean(process.env.PAYMENT_GATEWAY_KEY),
      adminPasscodeEnv: Boolean(process.env.ADMIN_PASSCODE),
    });
  });

  // =========================================================================
  // AUTHENTICATION & USER PROFILE
  // =========================================================================
  app.get('/api/auth/me', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const adminBootstrap = await getAdminBootstrapState();
      if (!req.user) {
        return res.json({
          authenticated: false,
          user: null,
          adminBootstrap: {
            needsSetup: adminBootstrap.needsSetup,
            envConfigured: adminBootstrap.envConfigured,
          },
        });
      }
      const [dbUser] = await db.select().from(users).where(eq(users.uid, req.user.uid)).limit(1);
      if (!dbUser) {
        return res.json({ authenticated: false, user: null, adminBootstrap: { needsSetup: adminBootstrap.needsSetup, envConfigured: adminBootstrap.envConfigured } });
      }
      res.json({
        authenticated: true,
        user: {
          uid: dbUser.uid,
          email: dbUser.email,
          phone: dbUser.phone || '',
          username: dbUser.username,
          avatarUrl: dbUser.avatarUrl || '',
          role: dbUser.role,
          status: dbUser.status,
          subscriptionTier: dbUser.subscriptionTier,
          subscriptionExpiresAt: dbUser.subscriptionExpiresAt,
          preferredLanguages: dbUser.preferredLanguages,
          maxAgeRating: dbUser.maxAgeRating,
        },
        adminBootstrap: {
          needsSetup: adminBootstrap.needsSetup,
          envConfigured: adminBootstrap.envConfigured,
        },
      });
    } catch (error) {
      console.error('/api/auth/me error:', error);
      res.status(500).json({ error: 'Unable to load account session.' });
    }
  });

  app.post('/api/auth/register', sensitiveLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const username = String(req.body?.username || '').trim() || email.split('@')[0];
      const phone = String(req.body?.phone || '').trim();

      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }

      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      }

      const uid = `local_${crypto.randomBytes(8).toString('hex')}`;
      const isInitialAdmin = email === DEFAULT_ADMIN_EMAIL;
      const [created] = await db
        .insert(users)
        .values({
          uid,
          email,
          phone,
          username: username.slice(0, 48),
          passwordHash: hashPassword(password),
          role: isInitialAdmin ? 'admin' : 'user',
          status: 'active',
          subscriptionTier: isInitialAdmin ? 'yearly' : 'free',
          preferredLanguages: ['English', 'Hindi'],
        })
        .returning();

      const token = createSessionToken({ uid: created.uid, email: created.email, role: created.role });
      res.status(201).json({
        token,
        user: {
          uid: created.uid,
          email: created.email,
          phone: created.phone || '',
          username: created.username,
          avatarUrl: created.avatarUrl || '',
          role: created.role,
          status: created.status,
          subscriptionTier: created.subscriptionTier,
          subscriptionExpiresAt: created.subscriptionExpiresAt,
          preferredLanguages: created.preferredLanguages,
          maxAgeRating: created.maxAgeRating,
        },
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Account registration failed.' });
    }
  });

  app.post('/api/auth/login', sensitiveLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }
      const [found] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!found || !verifyPassword(password, found.passwordHash)) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      if (found.status !== 'active') {
        return res.status(403).json({ error: `Account is currently ${found.status}.` });
      }
      const token = createSessionToken({ uid: found.uid, email: found.email, role: found.role });
      res.json({
        token,
        user: {
          uid: found.uid,
          email: found.email,
          phone: found.phone || '',
          username: found.username,
          avatarUrl: found.avatarUrl || '',
          role: found.role,
          status: found.status,
          subscriptionTier: found.subscriptionTier,
          subscriptionExpiresAt: found.subscriptionExpiresAt,
          preferredLanguages: found.preferredLanguages,
          maxAgeRating: found.maxAgeRating,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Sign in failed.' });
    }
  });

  app.post('/api/auth/otp/request', sensitiveLimiter, async (req, res) => {
    const phone = String(req.body?.phone || '').replace(/[^\d+]/g, '');
    if (phone.length < 8) {
      return res.status(400).json({ error: 'Enter a valid mobile number with country code.' });
    }
    const code = String(crypto.randomInt(100000, 999999));
    otpStore.set(phone, { code, expiresAt: Date.now() + 5 * 60 * 1000 });
    res.json({
      sent: true,
      message: 'Verification OTP generated. Configure an SMS provider (Firebase Phone Auth / Twilio) for live SMS dispatch.',
      previewCode: code,
    });
  });

  app.post('/api/auth/otp/verify', sensitiveLimiter, async (req, res) => {
    try {
      const phone = String(req.body?.phone || '').replace(/[^\d+]/g, '');
      const code = String(req.body?.code || '').trim();
      const entry = otpStore.get(phone);
      if (!entry || Date.now() > entry.expiresAt || entry.code !== code) {
        return res.status(401).json({ error: 'Invalid or expired OTP code.' });
      }
      otpStore.delete(phone);

      const uid = `phone_${crypto.createHash('sha256').update(phone).digest('hex').slice(0, 16)}`;
      const dbUser = await getOrCreateDbUser({
        uid,
        email: `${phone.replace(/\+/g, '')}@mobile.kinostage.app`,
        username: `Member ${phone.slice(-4)}`,
        phone,
      });

      const token = createSessionToken({ uid: dbUser.uid, email: dbUser.email, role: dbUser.role });
      res.json({
        token,
        user: {
          uid: dbUser.uid,
          email: dbUser.email,
          phone: dbUser.phone || phone,
          username: dbUser.username,
          avatarUrl: dbUser.avatarUrl || '',
          role: dbUser.role,
          status: dbUser.status,
          subscriptionTier: dbUser.subscriptionTier,
          subscriptionExpiresAt: dbUser.subscriptionExpiresAt,
          preferredLanguages: dbUser.preferredLanguages,
          maxAgeRating: dbUser.maxAgeRating,
        },
      });
    } catch (error) {
      console.error('OTP verify error:', error);
      res.status(500).json({ error: 'Mobile verification failed.' });
    }
  });

  app.post('/api/auth/forgot-password', sensitiveLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid account email.' });
    }
    res.json({
      ok: true,
      message: `If an account exists for ${email}, a password reset link has been queued. Google Sign-In users manage credentials directly via Google Account Security.`,
    });
  });

  // First-run Admin Bootstrap & Unlock (secure scrypt claim or env ADMIN_PASSCODE)
  app.post('/api/auth/admin/claim', sensitiveLimiter, async (req, res) => {
    try {
      const passcode = String(req.body?.passcode || '').trim();
      const email = String(req.body?.email || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
      if (passcode.length < 8) {
        return res.status(400).json({ error: 'Admin passcode must be at least 8 characters.' });
      }
      const state = await getAdminBootstrapState();
      if (!state.needsSetup) {
        return res.status(403).json({ error: 'Super Admin credentials are already configured.' });
      }

      await db
        .insert(platformSettings)
        .values({
          key: 'admin_passcode_hash',
          valueJson: { hash: hashPassword(passcode), claimedBy: email },
        })
        .onConflictDoNothing();

      const adminUser = await getOrCreateDbUser({
        uid: 'seed-admin',
        email,
        username: 'Super Admin',
      });
      await db.update(users).set({ role: 'admin', subscriptionTier: 'yearly' }).where(eq(users.uid, adminUser.uid));

      const token = createSessionToken({ uid: adminUser.uid, email: adminUser.email, role: 'admin' });
      await logAdminAction(adminUser.email, 'ADMIN_BOOTSTRAP_CLAIM', 'auth', adminUser.uid, 'First-run Super Admin claimed.');

      res.json({
        token,
        user: {
          uid: adminUser.uid,
          email: adminUser.email,
          phone: adminUser.phone || '',
          username: adminUser.username,
          avatarUrl: adminUser.avatarUrl || '',
          role: 'admin',
          status: 'active',
          subscriptionTier: 'yearly',
          subscriptionExpiresAt: adminUser.subscriptionExpiresAt,
          preferredLanguages: adminUser.preferredLanguages,
          maxAgeRating: adminUser.maxAgeRating,
        },
      });
    } catch (error) {
      console.error('Admin claim error:', error);
      res.status(500).json({ error: 'Failed to claim Super Admin access.' });
    }
  });

  app.post('/api/auth/admin/unlock', sensitiveLimiter, async (req, res) => {
    try {
      const passcode = String(req.body?.passcode || '').trim();
      if (!passcode) {
        return res.status(400).json({ error: 'Passcode is required.' });
      }
      const state = await getAdminBootstrapState();
      let authorized = false;

      if (state.envConfigured) {
        const expected = Buffer.from(process.env.ADMIN_PASSCODE!.trim());
        const given = Buffer.from(passcode);
        authorized = expected.length === given.length && crypto.timingSafeEqual(expected, given);
      } else if (state.claimedHash) {
        authorized = verifyPassword(passcode, state.claimedHash);
      }

      if (!authorized) {
        return res.status(401).json({ error: 'Invalid Super Admin passcode.' });
      }

      const adminUser = await getOrCreateDbUser({
        uid: 'seed-admin',
        email: DEFAULT_ADMIN_EMAIL,
        username: 'Super Admin',
      });
      await db.update(users).set({ role: 'admin', subscriptionTier: 'yearly' }).where(eq(users.uid, adminUser.uid));

      const token = createSessionToken({ uid: adminUser.uid, email: adminUser.email, role: 'admin' });
      res.json({
        token,
        user: {
          uid: adminUser.uid,
          email: adminUser.email,
          phone: adminUser.phone || '',
          username: adminUser.username,
          avatarUrl: adminUser.avatarUrl || '',
          role: 'admin',
          status: 'active',
          subscriptionTier: 'yearly',
          subscriptionExpiresAt: adminUser.subscriptionExpiresAt,
          preferredLanguages: adminUser.preferredLanguages,
          maxAgeRating: adminUser.maxAgeRating,
        },
      });
    } catch (error) {
      console.error('Admin unlock error:', error);
      res.status(500).json({ error: 'Unable to verify admin access.' });
    }
  });

  app.patch('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updates: Record<string, unknown> = {};
      if (typeof req.body?.username === 'string' && req.body.username.trim()) {
        updates.username = req.body.username.trim().slice(0, 48);
      }
      if (typeof req.body?.phone === 'string') {
        updates.phone = req.body.phone.trim().slice(0, 24);
      }
      if (typeof req.body?.avatarUrl === 'string' && (!req.body.avatarUrl || isSafeMediaUrl(req.body.avatarUrl))) {
        updates.avatarUrl = req.body.avatarUrl.trim();
      }
      if (Array.isArray(req.body?.preferredLanguages)) {
        updates.preferredLanguages = req.body.preferredLanguages.map(String).slice(0, 6);
      }
      if (typeof req.body?.maxAgeRating === 'string' && ['U', '7+', '13+', '16+', '18+'].includes(req.body.maxAgeRating)) {
        updates.maxAgeRating = req.body.maxAgeRating;
      }
      if (typeof req.body?.parentalPin === 'string' && /^\d{4}$/.test(req.body.parentalPin)) {
        updates.parentalPinHash = hashPassword(req.body.parentalPin);
      }

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.uid, req.user!.uid))
        .returning();

      res.json({
        user: {
          uid: updated.uid,
          email: updated.email,
          phone: updated.phone || '',
          username: updated.username,
          avatarUrl: updated.avatarUrl || '',
          role: updated.role,
          status: updated.status,
          subscriptionTier: updated.subscriptionTier,
          subscriptionExpiresAt: updated.subscriptionExpiresAt,
          preferredLanguages: updated.preferredLanguages,
          maxAgeRating: updated.maxAgeRating,
        },
      });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ error: 'Could not update profile.' });
    }
  });

  // =========================================================================
  // CATALOG, DETAILS, WATCHLIST, HISTORY & RECOMMENDATIONS
  // =========================================================================
  app.get('/api/catalog', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const [allTitles, allPlans, allNotifications, allEvents, allChannels, allShows, paySetting] = await Promise.all([
        db.select().from(titles).where(eq(titles.published, true)).orderBy(desc(titles.createdAt)),
        db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)).orderBy(asc(subscriptionPlans.priceInr)),
        db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(15),
        db.select().from(liveEvents).orderBy(asc(liveEvents.id)),
        db.select().from(liveChannels).orderBy(asc(liveChannels.id)),
        db.select().from(realityShows).orderBy(asc(realityShows.id)),
        db.select().from(platformSettings).where(eq(platformSettings.key, 'payment_config')).limit(1),
      ]);

      let userWatchlistIds: number[] = [];
      let userHistory: Array<{
        titleId: number;
        episodeId: number | null;
        progressSeconds: number;
        durationSeconds: number;
        completed: boolean;
        updatedAt: string;
      }> = [];
      let preferredLanguages = ['English', 'Hindi'];

      if (req.user) {
        const [wl, wh, uRow] = await Promise.all([
          db.select().from(watchlist).where(eq(watchlist.userUid, req.user.uid)),
          db
            .select()
            .from(watchHistory)
            .where(eq(watchHistory.userUid, req.user.uid))
            .orderBy(desc(watchHistory.updatedAt)),
          db.select().from(users).where(eq(users.uid, req.user.uid)).limit(1),
        ]);
        userWatchlistIds = wl.map((w) => w.titleId);
        userHistory = wh.map((h) => ({
          titleId: h.titleId,
          episodeId: h.episodeId,
          progressSeconds: h.progressSeconds,
          durationSeconds: h.durationSeconds,
          completed: h.completed,
          updatedAt: h.updatedAt.toISOString(),
        }));
        if (uRow[0]?.preferredLanguages?.length) {
          preferredLanguages = uRow[0].preferredLanguages;
        }
      }

      const recommendations = computeRecommendations(
        allTitles.map((t) => ({
          ...t,
          type: t.type as 'movie' | 'series',
          videoSourceType: t.videoSourceType as 'youtube' | 'hls' | 'dash' | 'direct',
        })),
        userHistory,
        userWatchlistIds,
        preferredLanguages
      );

      res.json({
        titles: allTitles,
        plans: allPlans,
        notifications: allNotifications,
        liveEvents: allEvents,
        liveChannels: allChannels.map((c) => ({
          ...c,
          rtmpIngestUrl: null,
        })),
        realityShows: allShows,
        paymentConfig: paySetting[0]?.valueJson || {},
        watchlistIds: userWatchlistIds,
        watchHistory: userHistory,
        recommendations,
      });
    } catch (error) {
      console.error('/api/catalog error:', error);
      res.status(500).json({ error: 'Unable to load catalog.' });
    }
  });

  app.get('/api/titles/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid title ID.' });

      const [item] = await db.select().from(titles).where(eq(titles.id, id)).limit(1);
      if (!item) return res.status(404).json({ error: 'Title not found.' });

      const [titleSeasons, titleEpisodes, titleReviews, allPublished] = await Promise.all([
        db.select().from(seasons).where(eq(seasons.seriesId, id)).orderBy(asc(seasons.seasonNumber)),
        db.select().from(episodes).where(eq(episodes.seriesId, id)).orderBy(asc(episodes.episodeNumber)),
        db.select().from(reviews).where(eq(reviews.titleId, id)).orderBy(desc(reviews.createdAt)),
        db.select().from(titles).where(eq(titles.published, true)),
      ]);

      const structuredSeasons = titleSeasons.map((s) => ({
        ...s,
        episodes: titleEpisodes.filter((e) => e.seasonId === s.id),
      }));

      const itemGenres = new Set(item.genres.map((g) => g.toLowerCase()));
      const similar = allPublished
        .filter((t) => t.id !== item.id)
        .sort((a, b) => {
          const aMatch = a.genres.filter((g) => itemGenres.has(g.toLowerCase())).length;
          const bMatch = b.genres.filter((g) => itemGenres.has(g.toLowerCase())).length;
          return bMatch - aMatch || b.rating - a.rating;
        })
        .slice(0, 6);

      res.json({
        title: {
          ...item,
          seasons: structuredSeasons,
          reviews: titleReviews,
        },
        similar,
      });
    } catch (error) {
      console.error('/api/titles/:id error:', error);
      res.status(500).json({ error: 'Failed to load title details.' });
    }
  });

  app.post('/api/titles/:id/view', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid title ID.' });
      await db
        .update(titles)
        .set({ viewsCount: sql`${titles.viewsCount} + 1` })
        .where(eq(titles.id, id));
      res.json({ ok: true });
    } catch (error) {
      console.error('View increment error:', error);
      res.status(500).json({ error: 'Could not update view count.' });
    }
  });

  app.post('/api/titles/:id/reviews', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const rating = Math.min(5, Math.max(1, Math.round(Number(req.body?.rating || 5))));
      const comment = String(req.body?.comment || '').trim().slice(0, 600);
      if (!Number.isInteger(id) || !comment) {
        return res.status(400).json({ error: 'Please write a review comment before submitting.' });
      }

      const [saved] = await db
        .insert(reviews)
        .values({
          titleId: id,
          userUid: req.user!.uid,
          username: req.user!.username,
          rating,
          comment,
        })
        .returning();

      res.status(201).json({ review: saved });
    } catch (error) {
      console.error('Review submit error:', error);
      res.status(500).json({ error: 'Failed to submit review.' });
    }
  });

  app.post('/api/watchlist/toggle', requireAuth, async (req: AuthRequest, res) => {
    try {
      const titleId = Number(req.body?.titleId);
      if (!Number.isInteger(titleId)) return res.status(400).json({ error: 'Invalid titleId.' });

      const existing = await db
        .select()
        .from(watchlist)
        .where(and(eq(watchlist.userUid, req.user!.uid), eq(watchlist.titleId, titleId)))
        .limit(1);

      if (existing.length > 0) {
        await db.delete(watchlist).where(eq(watchlist.id, existing[0].id));
        return res.json({ inWatchlist: false, titleId });
      }

      await db.insert(watchlist).values({ userUid: req.user!.uid, titleId });
      res.json({ inWatchlist: true, titleId });
    } catch (error) {
      console.error('Watchlist toggle error:', error);
      res.status(500).json({ error: 'Could not update watchlist.' });
    }
  });

  app.post('/api/watch-history', requireAuth, async (req: AuthRequest, res) => {
    try {
      const titleId = Number(req.body?.titleId);
      const episodeId = req.body?.episodeId ? Number(req.body.episodeId) : null;
      const progressSeconds = Math.max(0, Math.round(Number(req.body?.progressSeconds || 0)));
      const durationSeconds = Math.max(1, Math.round(Number(req.body?.durationSeconds || 3600)));
      const completed = Boolean(req.body?.completed || progressSeconds >= durationSeconds * 0.92);

      if (!Number.isInteger(titleId)) return res.status(400).json({ error: 'Invalid titleId.' });

      const existing = await db
        .select()
        .from(watchHistory)
        .where(and(eq(watchHistory.userUid, req.user!.uid), eq(watchHistory.titleId, titleId)))
        .limit(1);

      if (existing.length > 0) {
        const [updated] = await db
          .update(watchHistory)
          .set({ episodeId, progressSeconds, durationSeconds, completed, updatedAt: new Date() })
          .where(eq(watchHistory.id, existing[0].id))
          .returning();
        return res.json({ item: updated });
      }

      const [inserted] = await db
        .insert(watchHistory)
        .values({
          userUid: req.user!.uid,
          titleId,
          episodeId,
          progressSeconds,
          durationSeconds,
          completed,
        })
        .returning();
      res.status(201).json({ item: inserted });
    } catch (error) {
      console.error('Watch history error:', error);
      res.status(500).json({ error: 'Could not save watch progress.' });
    }
  });

  // =========================================================================
  // REALITY SHOWS & MULTI-CAMERA LIVE HOUSE
  // =========================================================================
  app.get('/api/reality-shows', async (_req, res) => {
    try {
      const [shows, cams, parts, eps] = await Promise.all([
        db.select().from(realityShows).orderBy(asc(realityShows.id)),
        db.select().from(realityCameras).orderBy(asc(realityCameras.sortOrder)),
        db.select().from(realityParticipants).orderBy(desc(realityParticipants.votesCount)),
        db.select().from(realityEpisodes).orderBy(asc(realityEpisodes.id)),
      ]);

      const payload = shows.map((show) => ({
        ...show,
        // Never expose streamKeyHash to public API
        cameras: cams
          .filter((c) => c.showId === show.id)
          .map(({ streamKeyHash: _hidden, ...safeCam }) => safeCam),
        participants: parts.filter((p) => p.showId === show.id),
        episodes: eps.filter((e) => e.showId === show.id),
      }));

      res.json({ shows: payload });
    } catch (error) {
      console.error('/api/reality-shows error:', error);
      res.status(500).json({ error: 'Failed to load reality shows.' });
    }
  });

  app.post('/api/reality-shows/:showId/vote', sensitiveLimiter, async (req, res) => {
    try {
      const showId = Number(req.params.showId);
      const participantId = Number(req.body?.participantId);
      if (!Number.isInteger(showId) || !Number.isInteger(participantId)) {
        return res.status(400).json({ error: 'Invalid show or participant ID.' });
      }

      const [updated] = await db
        .update(realityParticipants)
        .set({ votesCount: sql`${realityParticipants.votesCount} + 1` })
        .where(and(eq(realityParticipants.id, participantId), eq(realityParticipants.showId, showId)))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Participant not found.' });

      broadcastToRoom(`reality-${showId}`, {
        type: 'participant:voted',
        participant: updated,
      });

      res.json({ participant: updated });
    } catch (error) {
      console.error('Reality vote error:', error);
      res.status(500).json({ error: 'Vote could not be recorded.' });
    }
  });

  // =========================================================================
  // LIVE TV CHANNELS, EVENTS & OWN LIVE STREAMING STUDIO
  // =========================================================================
  app.get('/api/live/channels', async (_req, res) => {
    try {
      const channels = await db.select().from(liveChannels).orderBy(asc(liveChannels.id));
      res.json({
        channels: channels.map((c) => ({ ...c, rtmpIngestUrl: null })),
      });
    } catch (error) {
      console.error('/api/live/channels error:', error);
      res.status(500).json({ error: 'Failed to load Live TV channels.' });
    }
  });

  app.get('/api/live/events', async (_req, res) => {
    try {
      const events = await db.select().from(liveEvents).orderBy(asc(liveEvents.id));
      res.json({ events });
    } catch (error) {
      console.error('/api/live/events error:', error);
      res.status(500).json({ error: 'Failed to load live events.' });
    }
  });

  app.post('/api/live/events/:id/rsvp', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid event ID.' });
      const [updated] = await db
        .update(liveEvents)
        .set({ rsvpCount: sql`${liveEvents.rsvpCount} + 1` })
        .where(eq(liveEvents.id, id))
        .returning();
      res.json({ event: updated });
    } catch (error) {
      console.error('RSVP error:', error);
      res.status(500).json({ error: 'Could not register reminder.' });
    }
  });

  app.get('/api/studio/streams', async (_req, res) => {
    try {
      const rows = await db.select().from(studioStreams).orderBy(desc(studioStreams.createdAt));
      res.json({
        streams: rows.map(({ streamKeyHash: _hidden, ...safe }) => safe),
      });
    } catch (error) {
      console.error('/api/studio/streams error:', error);
      res.status(500).json({ error: 'Failed to load studio streams.' });
    }
  });

  app.post('/api/studio/streams', requireAuth, async (req: AuthRequest, res) => {
    try {
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const category = String(req.body?.category || 'Live Studio').trim();
      const thumbnailUrl = isSafeMediaUrl(req.body?.thumbnailUrl)
        ? String(req.body.thumbnailUrl).trim()
        : '/src/assets/images/live_concert_arena_1795368962106.jpg';
      const saveRecording = req.body?.saveRecording !== false;

      if (!title) return res.status(400).json({ error: 'Stream title is required.' });

      // Generate secure stream key server-side; store only SHA-256 hash & last-4 hint
      const rawStreamKey = `ks_live_${crypto.randomBytes(20).toString('hex')}`;
      const streamKeyHash = crypto.createHash('sha256').update(rawStreamKey).digest('hex');
      const streamKeyHint = maskStreamKey(rawStreamKey);

      const [created] = await db
        .insert(studioStreams)
        .values({
          hostUid: req.user!.uid,
          hostName: req.user!.username,
          title: title.slice(0, 120),
          description: description.slice(0, 600),
          category: category.slice(0, 48),
          thumbnailUrl,
          status: 'live',
          rtmpIngestUrl: 'rtmps://ingest.kinostage.live/studio',
          hlsPlaybackUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          streamKeyHash,
          streamKeyHint,
          saveRecording,
          viewerCount: 1,
          startedAt: new Date(),
        })
        .returning();

      const { streamKeyHash: _hidden, ...safeStream } = created;
      broadcastGlobal({
        type: 'notification:push',
        notification: {
          id: Date.now(),
          title: `LIVE NOW: ${created.title}`,
          body: `${created.hostName} just started a live broadcast in ${created.category}.`,
          type: 'live_now',
          createdAt: new Date().toISOString(),
        },
      });

      // Return raw stream key ONCE strictly to the authenticated host/admin who created it
      res.status(201).json({
        stream: safeStream,
        oneTimeStreamKey: rawStreamKey,
      });
    } catch (error) {
      console.error('Create studio stream error:', error);
      res.status(500).json({ error: 'Failed to launch live studio stream.' });
    }
  });

  app.patch('/api/studio/streams/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const status = String(req.body?.status || 'ended');
      if (!Number.isInteger(id) || !['live', 'ended', 'idle'].includes(status)) {
        return res.status(400).json({ error: 'Invalid stream status update.' });
      }

      const [existing] = await db.select().from(studioStreams).where(eq(studioStreams.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Stream not found.' });
      if (existing.hostUid !== req.user!.uid && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Only the stream host or an admin can control this stream.' });
      }

      const [updated] = await db
        .update(studioStreams)
        .set({
          status,
          endedAt: status === 'ended' ? new Date() : existing.endedAt,
          recordingUrl:
            status === 'ended' && existing.saveRecording
              ? existing.hlsPlaybackUrl
              : existing.recordingUrl,
        })
        .where(eq(studioStreams.id, id))
        .returning();

      const { streamKeyHash: _hidden, ...safe } = updated;
      res.json({ stream: safe });
    } catch (error) {
      console.error('Update studio stream error:', error);
      res.status(500).json({ error: 'Failed to update stream status.' });
    }
  });

  // =========================================================================
  // LIVE CHAT, POLLS & MODERATION
  // =========================================================================
  app.get('/api/live/rooms/:roomId/state', async (req, res) => {
    try {
      const roomId = String(req.params.roomId).slice(0, 64);
      const [messages, polls, controlsRow] = await Promise.all([
        db
          .select()
          .from(liveChatMessages)
          .where(and(eq(liveChatMessages.roomId, roomId), eq(liveChatMessages.isDeleted, false)))
          .orderBy(desc(liveChatMessages.createdAt))
          .limit(60),
        db
          .select()
          .from(livePolls)
          .where(and(eq(livePolls.roomId, roomId), eq(livePolls.isActive, true)))
          .orderBy(desc(livePolls.createdAt)),
        db.select().from(platformSettings).where(eq(platformSettings.key, 'chat_controls')).limit(1),
      ]);

      res.json({
        roomId,
        messages: messages.reverse(),
        polls,
        controls: controlsRow[0]?.valueJson || { slowModeSeconds: 0, chatDisabled: false },
        connectedCount: roomClients.get(roomId)?.size || 0,
      });
    } catch (error) {
      console.error('Room state error:', error);
      res.status(500).json({ error: 'Failed to load live room state.' });
    }
  });

  app.post('/api/live/rooms/:roomId/polls/:pollId/vote', sensitiveLimiter, async (req, res) => {
    try {
      const roomId = String(req.params.roomId).slice(0, 64);
      const pollId = Number(req.params.pollId);
      const optionId = String(req.body?.optionId || '');
      if (!Number.isInteger(pollId) || !optionId) {
        return res.status(400).json({ error: 'Invalid poll vote.' });
      }

      const [poll] = await db.select().from(livePolls).where(eq(livePolls.id, pollId)).limit(1);
      if (!poll) return res.status(404).json({ error: 'Poll not found.' });

      const updatedOptions = poll.optionsJson.map((opt) =>
        opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
      );
      const [saved] = await db
        .update(livePolls)
        .set({ optionsJson: updatedOptions })
        .where(eq(livePolls.id, pollId))
        .returning();

      broadcastToRoom(roomId, { type: 'poll:updated', poll: saved });
      res.json({ poll: saved });
    } catch (error) {
      console.error('Poll vote error:', error);
      res.status(500).json({ error: 'Failed to record poll vote.' });
    }
  });

  app.post('/api/live/messages/:id/report', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid message ID.' });
      await db.update(liveChatMessages).set({ isReported: true }).where(eq(liveChatMessages.id, id));
      res.json({ ok: true });
    } catch (error) {
      console.error('Report message error:', error);
      res.status(500).json({ error: 'Failed to report message.' });
    }
  });

  app.post('/api/admin/chat/moderate', requireBroadcaster, async (req: AuthRequest, res) => {
    try {
      const action = String(req.body?.action || '');
      const roomId = String(req.body?.roomId || 'reality-1');

      if (action === 'pin' && req.body?.messageId) {
        const msgId = Number(req.body.messageId);
        const [msg] = await db
          .update(liveChatMessages)
          .set({ isPinned: Boolean(req.body?.pinned ?? true) })
          .where(eq(liveChatMessages.id, msgId))
          .returning();
        broadcastToRoom(roomId, { type: 'chat:pinned', message: msg });
        return res.json({ message: msg });
      }

      if (action === 'delete' && req.body?.messageId) {
        const msgId = Number(req.body.messageId);
        await db.update(liveChatMessages).set({ isDeleted: true }).where(eq(liveChatMessages.id, msgId));
        broadcastToRoom(roomId, { type: 'chat:deleted', messageId: msgId });
        return res.json({ ok: true });
      }

      if (action === 'controls') {
        const [existing] = await db
          .select()
          .from(platformSettings)
          .where(eq(platformSettings.key, 'chat_controls'))
          .limit(1);
        const current = (existing?.valueJson || { slowModeSeconds: 0, chatDisabled: false, blockedUids: [] }) as Record<string, unknown>;
        const nextVal = {
          ...current,
          ...(typeof req.body?.slowModeSeconds === 'number' ? { slowModeSeconds: Math.max(0, Math.min(60, req.body.slowModeSeconds)) } : {}),
          ...(typeof req.body?.chatDisabled === 'boolean' ? { chatDisabled: req.body.chatDisabled } : {}),
          ...(typeof req.body?.blockUid === 'string'
            ? { blockedUids: Array.from(new Set([...((current.blockedUids as string[]) || []), req.body.blockUid])) }
            : {}),
        };
        await db
          .insert(platformSettings)
          .values({ key: 'chat_controls', valueJson: nextVal, updatedAt: new Date() })
          .onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: nextVal, updatedAt: new Date() } });
        broadcastToRoom(roomId, { type: 'chat:controls', controls: nextVal });
        return res.json({ controls: nextVal });
      }

      res.status(400).json({ error: 'Unknown moderation action.' });
    } catch (error) {
      console.error('Chat moderate error:', error);
      res.status(500).json({ error: 'Moderation update failed.' });
    }
  });

  app.post('/api/admin/polls', requireBroadcaster, async (req: AuthRequest, res) => {
    try {
      const roomId = String(req.body?.roomId || 'reality-1');
      const question = String(req.body?.question || '').trim();
      const rawOptions = Array.isArray(req.body?.options) ? req.body.options : [];
      const optionsJson = rawOptions
        .map((label: unknown, i: number) => ({ id: `opt_${i + 1}`, label: String(label).trim(), votes: 0 }))
        .filter((o: { label: string }) => o.label.length > 0);

      if (!question || optionsJson.length < 2) {
        return res.status(400).json({ error: 'Poll question and at least 2 options are required.' });
      }

      const [poll] = await db
        .insert(livePolls)
        .values({ roomId, question, optionsJson, isActive: true })
        .returning();

      broadcastToRoom(roomId, { type: 'poll:created', poll });
      res.status(201).json({ poll });
    } catch (error) {
      console.error('Create poll error:', error);
      res.status(500).json({ error: 'Could not create live poll.' });
    }
  });

  // =========================================================================
  // SUBSCRIPTIONS & PAYMENTS (UPI / QR / GATEWAY — STRICT VERIFICATION)
  // =========================================================================
  app.get('/api/subscriptions/plans', async (_req, res) => {
    try {
      const [plans, paymentSetting] = await Promise.all([
        db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)).orderBy(asc(subscriptionPlans.priceInr)),
        db.select().from(platformSettings).where(eq(platformSettings.key, 'payment_config')).limit(1),
      ]);
      res.json({ plans, paymentConfig: paymentSetting[0]?.valueJson || {} });
    } catch (error) {
      console.error('Plans error:', error);
      res.status(500).json({ error: 'Unable to load subscription plans.' });
    }
  });

  app.get('/api/subscriptions/transactions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.userUid, req.user!.uid))
        .orderBy(desc(transactions.createdAt));
      res.json({ transactions: rows });
    } catch (error) {
      console.error('User transactions error:', error);
      res.status(500).json({ error: 'Unable to fetch transaction history.' });
    }
  });

  app.post('/api/subscriptions/checkout', requireAuth, sensitiveLimiter, async (req: AuthRequest, res) => {
    try {
      const planCode = String(req.body?.planCode || '');
      const paymentMethod = String(req.body?.paymentMethod || 'upi');
      const referenceId = String(req.body?.referenceId || '').trim();

      if (!['monthly', 'yearly'].includes(planCode)) {
        return res.status(400).json({ error: 'Select a valid Monthly or Yearly plan.' });
      }
      if (!['upi', 'qr', 'card_gateway'].includes(paymentMethod)) {
        return res.status(400).json({ error: 'Unsupported payment method.' });
      }
      if (referenceId.length < 6) {
        return res.status(400).json({ error: 'Enter a valid UPI UTR / transaction reference ID (min 6 characters).' });
      }

      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, planCode)).limit(1);
      if (!plan) return res.status(404).json({ error: 'Subscription plan not found.' });

      // Never auto-activate premium from an unverified client submission or screenshot!
      // Status remains 'pending_verification' until verified via Payment Provider or Admin Reconciliation.
      const [tx] = await db
        .insert(transactions)
        .values({
          userUid: req.user!.uid,
          userEmail: req.user!.email,
          planCode,
          amount: plan.priceInr,
          currency: 'INR',
          paymentMethod,
          referenceId: referenceId.slice(0, 64),
          status: 'pending_verification',
          adminNote: 'Submitted by member. Pending payment provider webhook or finance admin reconciliation.',
        })
        .returning();

      res.status(201).json({
        transaction: tx,
        message:
          'Payment reference recorded for verification. Premium access activates automatically once verified by our payment gateway or finance reconciliation desk.',
      });
    } catch (error) {
      console.error('Checkout error:', error);
      res.status(500).json({ error: 'Payment submission failed.' });
    }
  });

  // =========================================================================
  // COMPLIANCE & COPYRIGHT REPORTS
  // =========================================================================
  app.post('/api/compliance/report', sensitiveLimiter, async (req, res) => {
    try {
      const reporterName = String(req.body?.reporterName || '').trim();
      const reporterEmail = String(req.body?.reporterEmail || '').trim();
      const titleName = String(req.body?.titleName || '').trim();
      const claimType = String(req.body?.claimType || 'DMCA / Broadcast Rights').trim();
      const details = String(req.body?.details || '').trim();
      const titleId = req.body?.titleId ? Number(req.body.titleId) : null;

      if (!reporterName || !reporterEmail.includes('@') || !details) {
        return res.status(400).json({ error: 'Name, valid email, and claim details are required.' });
      }

      const [report] = await db
        .insert(copyrightReports)
        .values({
          titleId: Number.isInteger(titleId) ? titleId : null,
          titleName: titleName.slice(0, 140),
          reporterName: reporterName.slice(0, 80),
          reporterEmail: reporterEmail.slice(0, 120),
          claimType: claimType.slice(0, 80),
          details: details.slice(0, 1500),
          status: 'open',
        })
        .returning();

      res.status(201).json({ report });
    } catch (error) {
      console.error('Compliance report error:', error);
      res.status(500).json({ error: 'Could not submit compliance report.' });
    }
  });

  // =========================================================================
  // SUPER ADMIN DASHBOARD APIs (ALL PROTECTED BY requireAdmin)
  // =========================================================================
  app.get('/api/admin/overview', requireAdmin, async (_req: AuthRequest, res) => {
    try {
      const [
        allUsers,
        allTitles,
        allChannels,
        allShows,
        allCams,
        allParts,
        allEvents,
        allStudio,
        allTx,
        allImports,
        allNotifs,
        allReports,
        allLogs,
        allHistory,
        allSettings,
      ] = await Promise.all([
        db.select().from(users).orderBy(desc(users.createdAt)),
        db.select().from(titles).orderBy(desc(titles.createdAt)),
        db.select().from(liveChannels).orderBy(asc(liveChannels.id)),
        db.select().from(realityShows).orderBy(asc(realityShows.id)),
        db.select().from(realityCameras).orderBy(asc(realityCameras.sortOrder)),
        db.select().from(realityParticipants).orderBy(desc(realityParticipants.votesCount)),
        db.select().from(liveEvents).orderBy(asc(liveEvents.id)),
        db.select().from(studioStreams).orderBy(desc(studioStreams.createdAt)),
        db.select().from(transactions).orderBy(desc(transactions.createdAt)),
        db.select().from(youtubeImports).orderBy(desc(youtubeImports.createdAt)).limit(30),
        db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(20),
        db.select().from(copyrightReports).orderBy(desc(copyrightReports.createdAt)),
        db.select().from(adminActivityLogs).orderBy(desc(adminActivityLogs.createdAt)).limit(40),
        db.select().from(watchHistory),
        db.select().from(platformSettings),
      ]);

      const totalMovies = allTitles.filter((t) => t.type === 'movie').length;
      const totalSeries = allTitles.filter((t) => t.type === 'series').length;
      const totalViews = allTitles.reduce((acc, t) => acc + t.viewsCount, 0);
      const activeLiveStreams =
        allChannels.filter((c) => c.status === 'live').length +
        allCams.filter((c) => c.isOnline).length +
        allStudio.filter((s) => s.status === 'live').length;
      const verifiedRevenue = allTx
        .filter((tx) => tx.status === 'verified')
        .reduce((acc, tx) => acc + Number(tx.amount || 0), 0);
      const watchTimeMinutes =
        Math.round(allHistory.reduce((acc, h) => acc + h.progressSeconds, 0) / 60) +
        Math.round(totalViews * 0.42);

      const settingsMap = Object.fromEntries(allSettings.map((s) => [s.key, s.valueJson]));
      delete settingsMap.admin_passcode_hash;

      res.json({
        kpis: {
          totalUsers: allUsers.length,
          activeUsers: allUsers.filter((u) => u.status === 'active').length,
          premiumSubscribers: allUsers.filter((u) => u.subscriptionTier !== 'free').length,
          totalMovies,
          totalSeries,
          activeLiveStreams,
          totalViews,
          watchTimeMinutes,
          subscriptionRevenue: verifiedRevenue,
        },
        users: allUsers.map(({ passwordHash: _p, parentalPinHash: _pin, ...safeUser }) => safeUser),
        titles: allTitles,
        channels: allChannels,
        realityShows: allShows.map((s) => ({
          ...s,
          cameras: allCams
            .filter((c) => c.showId === s.id)
            .map(({ streamKeyHash: _h, ...safeCam }) => safeCam),
          participants: allParts.filter((p) => p.showId === s.id),
        })),
        events: allEvents,
        studioStreams: allStudio.map(({ streamKeyHash: _h, ...safe }) => safe),
        transactions: allTx,
        youtubeImports: allImports,
        notifications: allNotifs,
        copyrightReports: allReports,
        activityLogs: allLogs,
        settings: settingsMap,
      });
    } catch (error) {
      console.error('/api/admin/overview error:', error);
      res.status(500).json({ error: 'Unable to load admin overview.' });
    }
  });

  // Automatic YouTube Movie Import (Fetch Preview, Retry, Publish)
  app.post('/api/admin/youtube/fetch', requireAdmin, sensitiveLimiter, async (req: AuthRequest, res) => {
    try {
      const youtubeUrl = String(req.body?.youtubeUrl || '').trim();
      const preview = await fetchYouTubeMoviePreview(youtubeUrl, req.user!.email);
      res.json(preview);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch YouTube metadata.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/admin/youtube/retry/:importId', requireAdmin, sensitiveLimiter, async (req: AuthRequest, res) => {
    try {
      const importId = Number(req.params.importId);
      const [item] = await db.select().from(youtubeImports).where(eq(youtubeImports.id, importId)).limit(1);
      if (!item) return res.status(404).json({ error: 'Import log not found.' });
      const preview = await fetchYouTubeMoviePreview(item.youtubeUrl, req.user!.email);
      res.json(preview);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Retry failed.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/admin/youtube/publish', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const videoId = extractYouTubeVideoId(String(req.body?.youtubeVideoId || req.body?.youtubeUrl || ''));
      if (!videoId) return res.status(400).json({ error: 'Valid YouTube Video ID is required.' });

      const titleText = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      if (!titleText || !description) {
        return res.status(400).json({ error: 'Title and description are required before publishing.' });
      }

      const duplicate = await db
        .select({ id: titles.id, title: titles.title })
        .from(titles)
        .where(eq(titles.youtubeVideoId, videoId))
        .limit(1);

      if (duplicate.length > 0 && !req.body?.allowDuplicate) {
        return res.status(409).json({
          error: `Duplicate detected: YouTube video ${videoId} is already published as "${duplicate[0].title}".`,
        });
      }

      const posterUrl = isSafeMediaUrl(req.body?.posterUrl)
        ? String(req.body.posterUrl).trim()
        : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const backdropUrl = isSafeMediaUrl(req.body?.backdropUrl) ? String(req.body.backdropUrl).trim() : posterUrl;
      const slug = `${slugify(titleText)}-${videoId.slice(0, 5).toLowerCase()}`;

      const [created] = await db
        .insert(titles)
        .values({
          slug,
          type: req.body?.type === 'series' ? 'series' : 'movie',
          title: titleText.slice(0, 140),
          description: description.slice(0, 2000),
          posterUrl,
          backdropUrl,
          trailerYoutubeId: videoId,
          videoSourceType: 'youtube',
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          youtubeVideoId: videoId,
          releaseYear: Number(req.body?.releaseYear || new Date().getFullYear()),
          durationMinutes: Math.max(1, Number(req.body?.durationMinutes || 90)),
          language: String(req.body?.language || 'English'),
          genres: Array.isArray(req.body?.genres) && req.body.genres.length > 0 ? req.body.genres.map(String) : ['YouTube Feature'],
          castList: Array.isArray(req.body?.castList) ? req.body.castList.map(String) : [],
          director: String(req.body?.director || 'Official Channel'),
          rating: Math.min(10, Math.max(1, Number(req.body?.rating || 8.2))),
          ageRating: String(req.body?.ageRating || '13+'),
          category: String(req.body?.category || 'Official YouTube Embed'),
          tags: Array.isArray(req.body?.tags) ? req.body.tags.map(String) : ['youtube-embed'],
          isFeatured: Boolean(req.body?.isFeatured),
          isTrending: true,
          isLatest: true,
          isPremium: Boolean(req.body?.isPremium),
          published: true,
          rightsOwner: String(req.body?.rightsOwner || 'Official YouTube Channel'),
          rightsType: 'Official YouTube Embedded Player',
        })
        .returning();

      if (req.body?.importId) {
        await db
          .update(youtubeImports)
          .set({ status: 'published', matchedTitleId: created.id, fetchedTitle: created.title })
          .where(eq(youtubeImports.id, Number(req.body.importId)));
      }

      await logAdminAction(
        req.user!.email,
        'YOUTUBE_MOVIE_PUBLISHED',
        'title',
        String(created.id),
        `Published "${created.title}" (YouTube ID: ${videoId})`
      );

      res.status(201).json({ title: created });
    } catch (error) {
      console.error('YouTube publish error:', error);
      res.status(500).json({ error: 'Failed to publish imported title.' });
    }
  });

  // Content CRUD (Movies, Web Series, Seasons, Episodes)
  app.post('/api/admin/titles', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const titleText = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const videoUrl = String(req.body?.videoUrl || '').trim();
      if (!titleText || !description || !isSafeMediaUrl(videoUrl)) {
        return res.status(400).json({ error: 'Title, description, and a valid video URL are required.' });
      }

      const posterUrl = isSafeMediaUrl(req.body?.posterUrl)
        ? String(req.body.posterUrl).trim()
        : '/src/assets/images/poster_midnight_protocol_1795368981364.jpg';
      const backdropUrl = isSafeMediaUrl(req.body?.backdropUrl) ? String(req.body.backdropUrl).trim() : posterUrl;
      const slug = `${slugify(titleText)}-${Date.now().toString(36).slice(-4)}`;

      const [created] = await db
        .insert(titles)
        .values({
          slug,
          type: req.body?.type === 'series' ? 'series' : 'movie',
          title: titleText,
          description,
          posterUrl,
          backdropUrl,
          trailerYoutubeId: extractYouTubeVideoId(String(req.body?.trailerYoutubeId || '')) || '',
          videoSourceType: ['youtube', 'hls', 'dash', 'direct'].includes(req.body?.videoSourceType)
            ? req.body.videoSourceType
            : 'hls',
          videoUrl,
          youtubeVideoId: req.body?.videoSourceType === 'youtube' ? extractYouTubeVideoId(videoUrl) : null,
          releaseYear: Number(req.body?.releaseYear || 2026),
          durationMinutes: Number(req.body?.durationMinutes || 110),
          language: String(req.body?.language || 'English'),
          genres: Array.isArray(req.body?.genres) ? req.body.genres.map(String) : ['Drama'],
          castList: Array.isArray(req.body?.castList) ? req.body.castList.map(String) : [],
          director: String(req.body?.director || ''),
          rating: Number(req.body?.rating || 8.5),
          ageRating: String(req.body?.ageRating || '16+'),
          category: String(req.body?.category || 'Feature Film'),
          tags: Array.isArray(req.body?.tags) ? req.body.tags.map(String) : [],
          isFeatured: Boolean(req.body?.isFeatured),
          isTrending: Boolean(req.body?.isTrending),
          isLatest: true,
          isPremium: Boolean(req.body?.isPremium),
          published: req.body?.published !== false,
          rightsOwner: String(req.body?.rightsOwner || 'KinoStage Licensed Distribution'),
          rightsType: String(req.body?.rightsType || 'Authorized OTT Distribution'),
        })
        .returning();

      await logAdminAction(req.user!.email, 'TITLE_CREATED', 'title', String(created.id), created.title);
      res.status(201).json({ title: created });
    } catch (error) {
      console.error('Create title error:', error);
      res.status(500).json({ error: 'Could not create title.' });
    }
  });

  app.patch('/api/admin/titles/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid title ID.' });
      const patch: Record<string, unknown> = {};
      const fields = [
        'title',
        'description',
        'posterUrl',
        'backdropUrl',
        'category',
        'language',
        'ageRating',
        'published',
        'isFeatured',
        'isTrending',
        'isPremium',
        'top10Rank',
      ] as const;
      for (const f of fields) {
        if (req.body?.[f] !== undefined) patch[f] = req.body[f];
      }
      const [updated] = await db.update(titles).set(patch).where(eq(titles.id, id)).returning();
      if (!updated) return res.status(404).json({ error: 'Title not found.' });
      await logAdminAction(req.user!.email, 'TITLE_UPDATED', 'title', String(id), `Updated ${updated.title}`);
      res.json({ title: updated });
    } catch (error) {
      console.error('Patch title error:', error);
      res.status(500).json({ error: 'Failed to update title.' });
    }
  });

  app.delete('/api/admin/titles/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid title ID.' });
      await db.delete(titles).where(eq(titles.id, id));
      await logAdminAction(req.user!.email, 'TITLE_DELETED', 'title', String(id), 'Deleted catalog title.');
      res.json({ ok: true });
    } catch (error) {
      console.error('Delete title error:', error);
      res.status(500).json({ error: 'Failed to delete title.' });
    }
  });

  app.post('/api/admin/series/:seriesId/seasons', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const seriesId = Number(req.params.seriesId);
      const seasonNumber = Number(req.body?.seasonNumber || 1);
      const title = String(req.body?.title || `Season ${seasonNumber}`).trim();
      const [created] = await db
        .insert(seasons)
        .values({ seriesId, seasonNumber, title, releaseYear: Number(req.body?.releaseYear || 2026) })
        .returning();
      res.status(201).json({ season: created });
    } catch (error) {
      console.error('Add season error:', error);
      res.status(500).json({ error: 'Failed to add season.' });
    }
  });

  app.post('/api/admin/seasons/:seasonId/episodes', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const seasonId = Number(req.params.seasonId);
      const seriesId = Number(req.body?.seriesId);
      const title = String(req.body?.title || '').trim();
      const videoUrl = String(req.body?.videoUrl || '').trim();
      if (!title || !isSafeMediaUrl(videoUrl)) {
        return res.status(400).json({ error: 'Episode title and valid video URL are required.' });
      }
      const [created] = await db
        .insert(episodes)
        .values({
          seasonId,
          seriesId,
          episodeNumber: Number(req.body?.episodeNumber || 1),
          title,
          description: String(req.body?.description || ''),
          posterUrl: isSafeMediaUrl(req.body?.posterUrl)
            ? String(req.body.posterUrl)
            : '/src/assets/images/poster_velvet_dynasty_1795368968351.jpg',
          durationMinutes: Number(req.body?.durationMinutes || 45),
          videoSourceType: String(req.body?.videoSourceType || 'hls'),
          videoUrl,
          releaseDate: String(req.body?.releaseDate || new Date().toISOString().slice(0, 10)),
        })
        .returning();
      res.status(201).json({ episode: created });
    } catch (error) {
      console.error('Add episode error:', error);
      res.status(500).json({ error: 'Failed to add episode.' });
    }
  });

  // Live TV Channel Management
  app.post('/api/admin/channels', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const hlsUrl = String(req.body?.hlsUrl || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8').trim();
      if (!name || !isSafeMediaUrl(hlsUrl)) {
        return res.status(400).json({ error: 'Channel name and valid stream URL are required.' });
      }
      const [created] = await db
        .insert(liveChannels)
        .values({
          name,
          logoUrl: isSafeMediaUrl(req.body?.logoUrl) ? String(req.body.logoUrl) : '/src/assets/images/live_concert_arena_1795368962106.jpg',
          bannerUrl: isSafeMediaUrl(req.body?.bannerUrl) ? String(req.body.bannerUrl) : '/src/assets/images/live_concert_arena_1795368962106.jpg',
          category: String(req.body?.category || 'Entertainment'),
          language: String(req.body?.language || 'English'),
          streamType: ['hls', 'youtube', 'rtmp'].includes(req.body?.streamType) ? req.body.streamType : 'hls',
          hlsUrl,
          youtubeEmbedId: extractYouTubeVideoId(String(req.body?.youtubeEmbedId || '')) || '',
          rtmpIngestUrl: String(req.body?.rtmpIngestUrl || 'rtmps://ingest.kinostage.live/tv'),
          status: ['live', 'offline', 'scheduled'].includes(req.body?.status) ? req.body.status : 'live',
          currentProgram: String(req.body?.currentProgram || 'Live Broadcast'),
          scheduleJson: Array.isArray(req.body?.scheduleJson) ? req.body.scheduleJson : [],
          isPremium: Boolean(req.body?.isPremium),
        })
        .returning();
      await logAdminAction(req.user!.email, 'CHANNEL_CREATED', 'channel', String(created.id), created.name);
      res.status(201).json({ channel: created });
    } catch (error) {
      console.error('Create channel error:', error);
      res.status(500).json({ error: 'Failed to create Live TV channel.' });
    }
  });

  app.patch('/api/admin/channels/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const patch: Record<string, unknown> = {};
      for (const k of ['name', 'category', 'language', 'status', 'currentProgram', 'hlsUrl', 'isPremium'] as const) {
        if (req.body?.[k] !== undefined) patch[k] = req.body[k];
      }
      const [updated] = await db.update(liveChannels).set(patch).where(eq(liveChannels.id, id)).returning();
      res.json({ channel: updated });
    } catch (error) {
      console.error('Update channel error:', error);
      res.status(500).json({ error: 'Failed to update channel.' });
    }
  });

  app.delete('/api/admin/channels/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(liveChannels).where(eq(liveChannels.id, id));
      await logAdminAction(req.user!.email, 'CHANNEL_DELETED', 'channel', String(id), 'Removed Live TV channel.');
      res.json({ ok: true });
    } catch (error) {
      console.error('Delete channel error:', error);
      res.status(500).json({ error: 'Failed to delete channel.' });
    }
  });

  // Reality Show & Camera Management
  app.post('/api/admin/reality-shows', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const name = String(req.body?.name || '').trim();
      const description = String(req.body?.description || '').trim();
      if (!name || !description) return res.status(400).json({ error: 'Show name and description are required.' });
      const [created] = await db
        .insert(realityShows)
        .values({
          name,
          slug: `${slugify(name)}-${Date.now().toString(36).slice(-3)}`,
          logoUrl: isSafeMediaUrl(req.body?.logoUrl) ? String(req.body.logoUrl) : '/src/assets/images/reality_glass_house_1795368962146.jpg',
          coverUrl: isSafeMediaUrl(req.body?.coverUrl) ? String(req.body.coverUrl) : '/src/assets/images/reality_glass_house_1795368962146.jpg',
          description,
          isLive: req.body?.isLive !== false,
          episodeSchedule: String(req.body?.episodeSchedule || 'Daily 21:00 IST · 24/7 Multi-Cam'),
        })
        .returning();
      await logAdminAction(req.user!.email, 'REALITY_SHOW_CREATED', 'reality_show', String(created.id), created.name);
      res.status(201).json({ show: created });
    } catch (error) {
      console.error('Create reality show error:', error);
      res.status(500).json({ error: 'Failed to create reality show.' });
    }
  });

  app.post('/api/admin/reality-shows/:showId/cameras', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const showId = Number(req.params.showId);
      const name = String(req.body?.name || '').trim();
      const zone = String(req.body?.zone || 'Studio Zone').trim();
      const hlsPlaybackUrl = String(req.body?.hlsPlaybackUrl || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8').trim();
      if (!name || !isSafeMediaUrl(hlsPlaybackUrl)) {
        return res.status(400).json({ error: 'Camera name and valid HLS playback URL are required.' });
      }
      const rawKey = `ks_cam_${crypto.randomBytes(16).toString('hex')}`;
      const [cam] = await db
        .insert(realityCameras)
        .values({
          showId,
          name,
          zone,
          streamType: 'hls',
          hlsPlaybackUrl,
          rtmpIngestUrl: String(req.body?.rtmpIngestUrl || `rtmps://ingest.kinostage.live/show-${showId}`),
          streamKeyHash: crypto.createHash('sha256').update(rawKey).digest('hex'),
          streamKeyHint: maskStreamKey(rawKey),
          isOnline: req.body?.isOnline !== false,
          isRecording: req.body?.isRecording !== false,
          sortOrder: Number(req.body?.sortOrder || 10),
        })
        .returning();
      const { streamKeyHash: _h, ...safeCam } = cam;
      res.status(201).json({ camera: safeCam, oneTimeStreamKey: rawKey });
    } catch (error) {
      console.error('Add camera error:', error);
      res.status(500).json({ error: 'Failed to add reality camera.' });
    }
  });

  app.patch('/api/admin/reality-cameras/:camId', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const camId = Number(req.params.camId);
      const patch: Record<string, unknown> = {};
      if (typeof req.body?.isOnline === 'boolean') patch.isOnline = req.body.isOnline;
      if (typeof req.body?.isRecording === 'boolean') patch.isRecording = req.body.isRecording;
      if (typeof req.body?.hlsPlaybackUrl === 'string' && isSafeMediaUrl(req.body.hlsPlaybackUrl)) {
        patch.hlsPlaybackUrl = req.body.hlsPlaybackUrl.trim();
      }
      let rotatedKey: string | undefined;
      if (req.body?.rotateStreamKey === true) {
        rotatedKey = `ks_cam_${crypto.randomBytes(16).toString('hex')}`;
        patch.streamKeyHash = crypto.createHash('sha256').update(rotatedKey).digest('hex');
        patch.streamKeyHint = maskStreamKey(rotatedKey);
      }

      const [updated] = await db.update(realityCameras).set(patch).where(eq(realityCameras.id, camId)).returning();
      const { streamKeyHash: _h, ...safeCam } = updated;
      res.json({ camera: safeCam, ...(rotatedKey ? { oneTimeStreamKey: rotatedKey } : {}) });
    } catch (error) {
      console.error('Patch camera error:', error);
      res.status(500).json({ error: 'Failed to update camera.' });
    }
  });

  app.post('/api/admin/reality-shows/:showId/participants', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const showId = Number(req.params.showId);
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Participant name is required.' });
      const [created] = await db
        .insert(realityParticipants)
        .values({
          showId,
          name,
          role: String(req.body?.role || 'Housemate'),
          bio: String(req.body?.bio || 'Official Season Housemate'),
          avatarUrl: isSafeMediaUrl(req.body?.avatarUrl)
            ? String(req.body.avatarUrl)
            : '/src/assets/images/poster_velvet_dynasty_1795368968351.jpg',
          status: ['active', 'nominated', 'evicted'].includes(req.body?.status) ? req.body.status : 'active',
        })
        .returning();
      res.status(201).json({ participant: created });
    } catch (error) {
      console.error('Add participant error:', error);
      res.status(500).json({ error: 'Failed to add participant.' });
    }
  });

  app.patch('/api/admin/reality-participants/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const status = String(req.body?.status || 'active');
      if (!['active', 'nominated', 'evicted'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
      }
      const [updated] = await db
        .update(realityParticipants)
        .set({ status })
        .where(eq(realityParticipants.id, id))
        .returning();
      res.json({ participant: updated });
    } catch (error) {
      console.error('Patch participant error:', error);
      res.status(500).json({ error: 'Failed to update participant.' });
    }
  });

  // User Management
  app.patch('/api/admin/users/:uid', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const targetUid = String(req.params.uid);
      const patch: Record<string, unknown> = {};
      if (['active', 'suspended', 'blocked'].includes(req.body?.status)) patch.status = req.body.status;
      if (['user', 'moderator', 'broadcaster', 'admin'].includes(req.body?.role)) patch.role = req.body.role;
      if (['free', 'monthly', 'yearly'].includes(req.body?.subscriptionTier)) {
        patch.subscriptionTier = req.body.subscriptionTier;
        if (req.body.subscriptionTier === 'monthly') {
          patch.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        } else if (req.body.subscriptionTier === 'yearly') {
          patch.subscriptionExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        } else {
          patch.subscriptionExpiresAt = null;
        }
      }

      const [updated] = await db.update(users).set(patch).where(eq(users.uid, targetUid)).returning();
      if (!updated) return res.status(404).json({ error: 'User not found.' });
      await logAdminAction(req.user!.email, 'USER_UPDATED', 'user', targetUid, JSON.stringify(patch));
      const { passwordHash: _p, parentalPinHash: _pin, ...safe } = updated;
      res.json({ user: safe });
    } catch (error) {
      console.error('Admin user update error:', error);
      res.status(500).json({ error: 'Failed to update user.' });
    }
  });

  // Finance Management (Reconcile Payments, Refunds, UPI/QR Settings)
  app.post('/api/admin/transactions/:id/verify', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const action = String(req.body?.action || '');
      const adminNote = String(req.body?.adminNote || '').trim();
      if (!['verify', 'reject', 'refund'].includes(action)) {
        return res.status(400).json({ error: 'Action must be verify, reject, or refund.' });
      }

      const [tx] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
      if (!tx) return res.status(404).json({ error: 'Transaction not found.' });

      const nextStatus = action === 'verify' ? 'verified' : action === 'refund' ? 'refunded' : 'rejected';
      const [updatedTx] = await db
        .update(transactions)
        .set({
          status: nextStatus,
          adminNote: adminNote || `Reconciled as ${nextStatus} by ${req.user!.email}`,
          verifiedAt: new Date(),
        })
        .where(eq(transactions.id, id))
        .returning();

      if (action === 'verify') {
        const durationDays = tx.planCode === 'yearly' ? 365 : 30;
        await db
          .update(users)
          .set({
            subscriptionTier: tx.planCode,
            subscriptionExpiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
          })
          .where(eq(users.uid, tx.userUid));
      } else if (action === 'refund') {
        await db
          .update(users)
          .set({ subscriptionTier: 'free', subscriptionExpiresAt: null })
          .where(eq(users.uid, tx.userUid));
      }

      await logAdminAction(
        req.user!.email,
        `TRANSACTION_${nextStatus.toUpperCase()}`,
        'transaction',
        String(id),
        `${tx.userEmail} · ${tx.planCode} · INR ${tx.amount}`
      );
      res.json({ transaction: updatedTx });
    } catch (error) {
      console.error('Transaction verify error:', error);
      res.status(500).json({ error: 'Failed to reconcile transaction.' });
    }
  });

  app.put('/api/admin/settings/payment', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const valueJson = {
        upiId: String(req.body?.upiId || 'kinostage.ott@okhdfcbank').trim(),
        merchantName: String(req.body?.merchantName || 'KinoStage Digital Cinema').trim(),
        qrNote: String(req.body?.qrNote || 'KinoStage Subscription').trim(),
        gatewayProvider: String(req.body?.gatewayProvider || 'Razorpay / Stripe').trim(),
        gatewayEnabled: Boolean(req.body?.gatewayEnabled),
        requireAdminReconciliation: true,
      };
      await db
        .insert(platformSettings)
        .values({ key: 'payment_config', valueJson, updatedAt: new Date() })
        .onConflictDoUpdate({ target: platformSettings.key, set: { valueJson, updatedAt: new Date() } });

      await logAdminAction(req.user!.email, 'PAYMENT_CONFIG_UPDATED', 'settings', 'payment_config', valueJson.upiId);
      res.json({ paymentConfig: valueJson });
    } catch (error) {
      console.error('Payment config error:', error);
      res.status(500).json({ error: 'Failed to save payment settings.' });
    }
  });

  // Notification Broadcast
  app.post('/api/admin/notifications', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const title = String(req.body?.title || '').trim();
      const body = String(req.body?.body || '').trim();
      const type = String(req.body?.type || 'new_movie');
      const targetAudience = String(req.body?.targetAudience || 'all');
      if (!title || !body) return res.status(400).json({ error: 'Title and message body are required.' });

      const [saved] = await db
        .insert(notifications)
        .values({ title, body, type, targetAudience })
        .returning();

      broadcastGlobal({ type: 'notification:push', notification: saved });
      await logAdminAction(req.user!.email, 'NOTIFICATION_SENT', 'notification', String(saved.id), title);
      res.status(201).json({ notification: saved });
    } catch (error) {
      console.error('Send notification error:', error);
      res.status(500).json({ error: 'Failed to send notification.' });
    }
  });

  // Compliance Takedown Resolution
  app.patch('/api/admin/compliance/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const status = String(req.body?.status || 'under_review');
      if (!['open', 'under_review', 'takedown_executed', 'dismissed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid compliance status.' });
      }
      const [updated] = await db
        .update(copyrightReports)
        .set({ status })
        .where(eq(copyrightReports.id, id))
        .returning();

      if (status === 'takedown_executed' && updated?.titleId) {
        await db.update(titles).set({ published: false }).where(eq(titles.id, updated.titleId));
      }

      await logAdminAction(req.user!.email, 'COMPLIANCE_UPDATED', 'copyright_report', String(id), status);
      res.json({ report: updated });
    } catch (error) {
      console.error('Compliance update error:', error);
      res.status(500).json({ error: 'Failed to update compliance report.' });
    }
  });

  // AI Agent Management (Server-Side Gemini 4 Hydrogen — Admin Review Required Before Publishing)
  app.post('/api/admin/ai/assist', requireAdmin, sensitiveLimiter, async (req: AuthRequest, res) => {
    try {
      const task = req.body?.task;
      const validTasks = [
        'suggest_categories',
        'generate_description',
        'recommend_posters',
        'detect_duplicates',
        'suggest_featured',
        'generate_tags',
        'analyze_trends',
        'weekly_report',
      ];
      if (!validTasks.includes(task)) {
        return res.status(400).json({ error: 'Unsupported AI management task.' });
      }

      const [allTitles, allUsers, allTx] = await Promise.all([
        db.select().from(titles),
        db.select().from(users),
        db.select().from(transactions),
      ]);

      const context = {
        titles: allTitles.map((t) => ({
          id: t.id,
          title: t.title,
          type: t.type,
          genres: t.genres,
          language: t.language,
          viewsCount: t.viewsCount,
          rating: t.rating,
          isFeatured: t.isFeatured,
          youtubeVideoId: t.youtubeVideoId,
        })),
        totalUsers: allUsers.length,
        premiumSubscribers: allUsers.filter((u) => u.subscriptionTier !== 'free').length,
        totalRevenue: allTx
          .filter((tx) => tx.status === 'verified')
          .reduce((acc, tx) => acc + Number(tx.amount || 0), 0),
      };

      const draft = await runAdminAiTask(task, req.body?.input || {}, context);
      await logAdminAction(req.user!.email, 'AI_DRAFT_GENERATED', 'ai_assistant', task, draft.headline);

      res.json({
        draft,
        requiresAdminReview: true,
        model: 'gemini-4-hydrogen',
      });
    } catch (error) {
      console.error('Admin AI assist error:', error);
      const message = error instanceof Error ? error.message : 'Gemini AI service error.';
      res.status(502).json({ error: message });
    }
  });

  // =========================================================================
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC DELIVERY
  // =========================================================================
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`KinoStage OTT Platform running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
