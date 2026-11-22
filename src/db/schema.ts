import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  phone: text('phone').default(''),
  username: text('username').notNull().default('Cinema Member'),
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url').default(''),
  role: text('role').notNull().default('user'), // user | moderator | broadcaster | admin
  status: text('status').notNull().default('active'), // active | suspended | blocked
  subscriptionTier: text('subscription_tier').notNull().default('free'), // free | monthly | yearly
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  preferredLanguages: jsonb('preferred_languages').$type<string[]>().notNull().default(['English', 'Hindi']),
  maxAgeRating: text('max_age_rating').notNull().default('18+'),
  parentalPinHash: text('parental_pin_hash'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const titles = pgTable('titles', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  type: text('type').notNull().default('movie'), // movie | series
  title: text('title').notNull(),
  description: text('description').notNull(),
  posterUrl: text('poster_url').notNull(),
  backdropUrl: text('backdrop_url').notNull(),
  trailerYoutubeId: text('trailer_youtube_id').default(''),
  videoSourceType: text('video_source_type').notNull().default('hls'), // youtube | hls | dash | direct
  videoUrl: text('video_url').notNull(),
  youtubeVideoId: text('youtube_video_id'),
  releaseYear: integer('release_year').notNull().default(2026),
  durationMinutes: integer('duration_minutes').notNull().default(118),
  language: text('language').notNull().default('English'),
  genres: jsonb('genres').$type<string[]>().notNull().default(['Thriller']),
  castList: jsonb('cast_list').$type<string[]>().notNull().default([]),
  director: text('director').notNull().default(''),
  rating: real('rating').notNull().default(8.4),
  ageRating: text('age_rating').notNull().default('16+'),
  category: text('category').notNull().default('Feature Film'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  isFeatured: boolean('is_featured').notNull().default(false),
  isTrending: boolean('is_trending').notNull().default(false),
  top10Rank: integer('top10_rank'),
  isLatest: boolean('is_latest').notNull().default(false),
  isPremium: boolean('is_premium').notNull().default(false),
  published: boolean('published').notNull().default(true),
  viewsCount: integer('views_count').notNull().default(0),
  rightsOwner: text('rights_owner').notNull().default('KinoStage Licensed Distribution'),
  rightsType: text('rights_type').notNull().default('Authorized OTT / Official Embed'),
  allowedRegions: jsonb('allowed_regions').$type<string[]>().notNull().default(['GLOBAL']),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  seriesId: integer('series_id')
    .references(() => titles.id, { onDelete: 'cascade' })
    .notNull(),
  seasonNumber: integer('season_number').notNull(),
  title: text('title').notNull(),
  releaseYear: integer('release_year').notNull().default(2026),
});

export const episodes = pgTable('episodes', {
  id: serial('id').primaryKey(),
  seasonId: integer('season_id')
    .references(() => seasons.id, { onDelete: 'cascade' })
    .notNull(),
  seriesId: integer('series_id')
    .references(() => titles.id, { onDelete: 'cascade' })
    .notNull(),
  episodeNumber: integer('episode_number').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  posterUrl: text('poster_url').notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(46),
  videoSourceType: text('video_source_type').notNull().default('hls'),
  videoUrl: text('video_url').notNull(),
  releaseDate: text('release_date').notNull().default('2026-10-12'),
});

export const watchlist = pgTable('watchlist', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  titleId: integer('title_id')
    .references(() => titles.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const watchHistory = pgTable('watch_history', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  titleId: integer('title_id')
    .references(() => titles.id, { onDelete: 'cascade' })
    .notNull(),
  episodeId: integer('episode_id'),
  progressSeconds: integer('progress_seconds').notNull().default(0),
  durationSeconds: integer('duration_seconds').notNull().default(3600),
  completed: boolean('completed').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  titleId: integer('title_id')
    .references(() => titles.id, { onDelete: 'cascade' })
    .notNull(),
  userUid: text('user_uid').notNull(),
  username: text('username').notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const realityShows = pgTable('reality_shows', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url').notNull(),
  coverUrl: text('cover_url').notNull(),
  description: text('description').notNull(),
  isLive: boolean('is_live').notNull().default(true),
  episodeSchedule: text('episode_schedule').notNull().default('Daily 21:00 IST · 24/7 Live Feed'),
  viewerCount: integer('viewer_count').notNull().default(14820),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const realityCameras = pgTable('reality_cameras', {
  id: serial('id').primaryKey(),
  showId: integer('show_id')
    .references(() => realityShows.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  zone: text('zone').notNull(),
  streamType: text('stream_type').notNull().default('hls'), // hls | youtube | direct
  hlsPlaybackUrl: text('hls_playback_url').notNull(),
  rtmpIngestUrl: text('rtmp_ingest_url').notNull().default('rtmps://ingest.kinostage.live/app'),
  streamKeyHash: text('stream_key_hash').notNull().default(''),
  streamKeyHint: text('stream_key_hint').notNull().default('••••cam1'),
  isOnline: boolean('is_online').notNull().default(true),
  viewerCount: integer('viewer_count').notNull().default(2400),
  isRecording: boolean('is_recording').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(1),
});

export const realityParticipants = pgTable('reality_participants', {
  id: serial('id').primaryKey(),
  showId: integer('show_id')
    .references(() => realityShows.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  bio: text('bio').notNull(),
  avatarUrl: text('avatar_url').notNull(),
  status: text('status').notNull().default('active'), // active | nominated | evicted
  votesCount: integer('votes_count').notNull().default(0),
});

export const realityEpisodes = pgTable('reality_episodes', {
  id: serial('id').primaryKey(),
  showId: integer('show_id')
    .references(() => realityShows.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull().default('previous'), // upcoming | previous | highlight | replay
  airDate: text('air_date').notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(52),
  thumbnailUrl: text('thumbnail_url').notNull(),
  videoSourceType: text('video_source_type').notNull().default('hls'),
  videoUrl: text('video_url').notNull(),
});

export interface BroadcastSlot {
  time: string;
  program: string;
  duration: string;
}

export const liveChannels = pgTable('live_channels', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  logoUrl: text('logo_url').notNull(),
  bannerUrl: text('banner_url').notNull(),
  category: text('category').notNull(),
  language: text('language').notNull().default('English'),
  streamType: text('stream_type').notNull().default('hls'), // hls | youtube | rtmp
  hlsUrl: text('hls_url').notNull(),
  youtubeEmbedId: text('youtube_embed_id').default(''),
  rtmpIngestUrl: text('rtmp_ingest_url').default('rtmps://ingest.kinostage.live/tv'),
  streamKeyHint: text('stream_key_hint').default('••••tv01'),
  status: text('status').notNull().default('live'), // live | offline | scheduled
  currentProgram: text('current_program').notNull(),
  scheduleJson: jsonb('schedule_json').$type<BroadcastSlot[]>().notNull().default([]),
  viewerCount: integer('viewer_count').notNull().default(3400),
  isPremium: boolean('is_premium').notNull().default(false),
});

export const liveEvents = pgTable('live_events', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  bannerUrl: text('banner_url').notNull(),
  category: text('category').notNull(),
  startsAt: text('starts_at').notNull(),
  status: text('status').notNull().default('upcoming'), // upcoming | live | ended
  streamType: text('stream_type').notNull().default('hls'),
  streamUrl: text('stream_url').notNull(),
  isPremium: boolean('is_premium').notNull().default(false),
  rsvpCount: integer('rsvp_count').notNull().default(1200),
});

export const studioStreams = pgTable('studio_streams', {
  id: serial('id').primaryKey(),
  hostUid: text('host_uid').notNull(),
  hostName: text('host_name').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default('Premiere Live'),
  thumbnailUrl: text('thumbnail_url').notNull(),
  status: text('status').notNull().default('idle'), // idle | live | ended
  rtmpIngestUrl: text('rtmp_ingest_url').notNull().default('rtmps://ingest.kinostage.live/studio'),
  hlsPlaybackUrl: text('hls_playback_url').notNull(),
  streamKeyHash: text('stream_key_hash').notNull(),
  streamKeyHint: text('stream_key_hint').notNull(),
  recordingUrl: text('recording_url').default(''),
  saveRecording: boolean('save_recording').notNull().default(true),
  viewerCount: integer('viewer_count').notNull().default(0),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const liveChatMessages = pgTable('live_chat_messages', {
  id: serial('id').primaryKey(),
  roomId: text('room_id').notNull(),
  userUid: text('user_uid').notNull(),
  username: text('username').notNull(),
  userRole: text('user_role').notNull().default('user'),
  message: text('message').notNull(),
  isPinned: boolean('is_pinned').notNull().default(false),
  isReported: boolean('is_reported').notNull().default(false),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export const livePolls = pgTable('live_polls', {
  id: serial('id').primaryKey(),
  roomId: text('room_id').notNull(),
  question: text('question').notNull(),
  optionsJson: jsonb('options_json').$type<PollOption[]>().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const subscriptionPlans = pgTable('subscription_plans', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // free | monthly | yearly
  name: text('name').notNull(),
  priceInr: integer('price_inr').notNull(),
  priceUsd: real('price_usd').notNull(),
  billingCycle: text('billing_cycle').notNull(),
  featuresJson: jsonb('features_json').$type<string[]>().notNull().default([]),
  maxQuality: text('max_quality').notNull().default('1080p'),
  adsSupported: boolean('ads_supported').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
});

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  userEmail: text('user_email').notNull(),
  planCode: text('plan_code').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('INR'),
  paymentMethod: text('payment_method').notNull().default('upi'), // upi | qr | card_gateway
  referenceId: text('reference_id').notNull(),
  status: text('status').notNull().default('pending_verification'), // pending_verification | verified | rejected | refunded
  adminNote: text('admin_note').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  verifiedAt: timestamp('verified_at'),
});

export const youtubeImports = pgTable('youtube_imports', {
  id: serial('id').primaryKey(),
  youtubeVideoId: text('youtube_video_id').notNull(),
  youtubeUrl: text('youtube_url').notNull(),
  fetchedTitle: text('fetched_title').notNull().default(''),
  matchedTitleId: integer('matched_title_id'),
  status: text('status').notNull().default('preview'), // preview | published | failed | duplicate
  errorMessage: text('error_message').default(''),
  payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text('created_by').notNull().default('admin'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  type: text('type').notNull().default('new_movie'), // new_movie | live_now | upcoming_show | subscription_expiry | system
  targetAudience: text('target_audience').notNull().default('all'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const copyrightReports = pgTable('copyright_reports', {
  id: serial('id').primaryKey(),
  titleId: integer('title_id'),
  titleName: text('title_name').notNull().default(''),
  reporterName: text('reporter_name').notNull(),
  reporterEmail: text('reporter_email').notNull(),
  claimType: text('claim_type').notNull().default('DMCA / Broadcast Rights'),
  details: text('details').notNull(),
  status: text('status').notNull().default('open'), // open | under_review | takedown_executed | dismissed
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  valueJson: jsonb('value_json').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const adminActivityLogs = pgTable('admin_activity_logs', {
  id: serial('id').primaryKey(),
  adminEmail: text('admin_email').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull().default(''),
  details: text('details').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const titlesRelations = relations(titles, ({ many }) => ({
  seasons: many(seasons),
  episodes: many(episodes),
  reviews: many(reviews),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  series: one(titles, { fields: [seasons.seriesId], references: [titles.id] }),
  episodes: many(episodes),
}));

export const episodesRelations = relations(episodes, ({ one }) => ({
  season: one(seasons, { fields: [episodes.seasonId], references: [seasons.id] }),
  series: one(titles, { fields: [episodes.seriesId], references: [titles.id] }),
}));

export const realityShowsRelations = relations(realityShows, ({ many }) => ({
  cameras: many(realityCameras),
  participants: many(realityParticipants),
  episodes: many(realityEpisodes),
}));

export const realityCamerasRelations = relations(realityCameras, ({ one }) => ({
  show: one(realityShows, { fields: [realityCameras.showId], references: [realityShows.id] }),
}));

export const realityParticipantsRelations = relations(realityParticipants, ({ one }) => ({
  show: one(realityShows, { fields: [realityParticipants.showId], references: [realityShows.id] }),
}));

export const realityEpisodesRelations = relations(realityEpisodes, ({ one }) => ({
  show: one(realityShows, { fields: [realityEpisodes.showId], references: [realityShows.id] }),
}));
