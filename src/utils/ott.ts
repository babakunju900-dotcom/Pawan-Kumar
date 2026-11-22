export interface TitleSummary {
  id: number;
  slug: string;
  type: 'movie' | 'series';
  title: string;
  description: string;
  posterUrl: string;
  backdropUrl: string;
  trailerYoutubeId?: string | null;
  videoSourceType: 'youtube' | 'hls' | 'dash' | 'direct';
  videoUrl: string;
  youtubeVideoId?: string | null;
  releaseYear: number;
  durationMinutes: number;
  language: string;
  genres: string[];
  castList: string[];
  director: string;
  rating: number;
  ageRating: string;
  category: string;
  tags: string[];
  isFeatured: boolean;
  isTrending: boolean;
  top10Rank?: number | null;
  isLatest: boolean;
  isPremium: boolean;
  published: boolean;
  viewsCount: number;
  rightsOwner: string;
  rightsType: string;
  allowedRegions: string[];
}

export interface WatchProgressItem {
  titleId: number;
  episodeId?: number | null;
  progressSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt?: string;
}

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts a validated 11-character YouTube Video ID from standard YouTube URLs
 * (watch, youtu.be, embed, live, shorts) or a bare 11-character ID.
 * Returns null for invalid or unsafe inputs.
 */
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;

  if (YOUTUBE_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let candidate: string | null = null;

  if (host === 'youtu.be') {
    candidate = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      candidate = parsed.searchParams.get('v');
    } else {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length >= 2 && ['embed', 'live', 'shorts', 'v'].includes(segments[0])) {
        candidate = segments[1];
      }
    }
  }

  return candidate && YOUTUBE_ID_REGEX.test(candidate) ? candidate : null;
}

/**
 * Validates that a media or image URL is safe for client rendering.
 * Allows relative app asset paths (/src/assets/...) and http/https URLs,
 * blocking javascript:, data:, vbscript:, and malformed URLs.
 */
export function isSafeMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/src/assets/') || trimmed.startsWith('/assets/')) {
    return !trimmed.includes('..');
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Builds an official YouTube embedded player URL from a validated video ID.
 */
export function buildYouTubeEmbedUrl(videoId: string, autoplay = false): string | null {
  const cleanId = extractYouTubeVideoId(videoId);
  if (!cleanId) return null;
  const params = new URLSearchParams({
    enablejsapi: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  if (autoplay) params.set('autoplay', '1');
  return `https://www.youtube.com/embed/${cleanId}?${params.toString()}`;
}

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return base || 'title';
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function calculateWatchProgress(progressSeconds: number, durationSeconds: number): number {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  const pct = (Math.max(0, progressSeconds) / durationSeconds) * 100;
  return Math.min(100, Math.round(pct));
}

export function validateSubscriptionAccess(
  userTier: 'free' | 'monthly' | 'yearly',
  isPremiumContent: boolean
): boolean {
  if (!isPremiumContent) return true;
  return userTier === 'monthly' || userTier === 'yearly';
}

const AGE_RATING_ORDER: Record<string, number> = {
  U: 0,
  '7+': 7,
  '13+': 13,
  '16+': 16,
  '18+': 18,
};

export function canAccessAgeRating(userMaxRating: string, contentAgeRating: string): boolean {
  const maxAllowed = AGE_RATING_ORDER[userMaxRating] ?? 18;
  const required = AGE_RATING_ORDER[contentAgeRating] ?? 16;
  return required <= maxAllowed;
}

export function maskStreamKey(rawKey: string): string {
  if (!rawKey || rawKey.length < 4) return '••••';
  return `••••${rawKey.slice(-4)}`;
}

export interface RecommendationBundle<T extends TitleSummary> {
  continueWatching: Array<T & { progressSeconds: number; durationSeconds: number; progressPct: number }>;
  recommendedForYou: T[];
  becauseYouWatched: { anchorTitle: string; items: T[] } | null;
  popularInYourLanguage: { language: string; items: T[] };
}

/**
 * Computes personalized recommendations from viewing history, watch duration,
 * favorite genres, preferred languages, watchlist, and trending popularity.
 */
export function computeRecommendations<T extends TitleSummary>(
  catalog: T[],
  history: WatchProgressItem[],
  watchlistIds: number[],
  preferredLanguages: string[]
): RecommendationBundle<T> {
  const published = catalog.filter((t) => t.published);
  const byId = new Map(published.map((t) => [t.id, t]));
  const watchlistSet = new Set(watchlistIds);

  // 1. Continue Watching
  const continueWatching = history
    .filter((h) => !h.completed && h.progressSeconds > 15 && byId.has(h.titleId))
    .map((h) => {
      const item = byId.get(h.titleId)!;
      return {
        ...item,
        progressSeconds: h.progressSeconds,
        durationSeconds: h.durationSeconds,
        progressPct: calculateWatchProgress(h.progressSeconds, h.durationSeconds),
      };
    });

  // Build affinity weights from watch history + watchlist
  const genreScore = new Map<string, number>();
  const langScore = new Map<string, number>();
  for (const lang of preferredLanguages) {
    langScore.set(lang.toLowerCase(), (langScore.get(lang.toLowerCase()) ?? 0) + 3);
  }

  let anchor: T | null = null;
  let longestWatch = -1;

  for (const h of history) {
    const item = byId.get(h.titleId);
    if (!item) continue;
    const weight = h.completed ? 4 : Math.max(1, Math.min(3, h.progressSeconds / 600));
    for (const g of item.genres) {
      genreScore.set(g.toLowerCase(), (genreScore.get(g.toLowerCase()) ?? 0) + weight);
    }
    langScore.set(item.language.toLowerCase(), (langScore.get(item.language.toLowerCase()) ?? 0) + weight);
    if (h.progressSeconds > longestWatch) {
      longestWatch = h.progressSeconds;
      anchor = item;
    }
  }

  for (const id of watchlistIds) {
    const item = byId.get(id);
    if (!item) continue;
    for (const g of item.genres) {
      genreScore.set(g.toLowerCase(), (genreScore.get(g.toLowerCase()) ?? 0) + 2);
    }
  }

  // 2. Recommended For You
  const watchedIds = new Set(history.filter((h) => h.completed).map((h) => h.titleId));
  const scored = published
    .filter((t) => !watchedIds.has(t.id))
    .map((t) => {
      let score = t.rating * 0.6 + (t.isTrending ? 2 : 0) + Math.min(3, t.viewsCount / 50000);
      for (const g of t.genres) {
        score += genreScore.get(g.toLowerCase()) ?? 0;
      }
      score += langScore.get(t.language.toLowerCase()) ?? 0;
      if (watchlistSet.has(t.id)) score += 1.5;
      return { item: t, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);

  // 3. Because You Watched
  let becauseYouWatched: { anchorTitle: string; items: T[] } | null = null;
  if (anchor) {
    const anchorGenres = new Set(anchor.genres.map((g) => g.toLowerCase()));
    const related = published
      .filter((t) => t.id !== anchor!.id)
      .map((t) => {
        const overlap = t.genres.filter((g) => anchorGenres.has(g.toLowerCase())).length;
        const langBonus = t.language.toLowerCase() === anchor!.language.toLowerCase() ? 0.5 : 0;
        return { item: t, score: overlap * 2 + langBonus + t.rating * 0.1 };
      })
      .filter((r) => r.score >= 1.5)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);

    if (related.length > 0) {
      becauseYouWatched = { anchorTitle: anchor.title, items: related };
    }
  }

  // 4. Popular In Your Language
  const primaryLang = preferredLanguages[0] || 'English';
  const langMatches = published
    .filter((t) => t.language.toLowerCase() === primaryLang.toLowerCase())
    .sort((a, b) => b.viewsCount - a.viewsCount);

  return {
    continueWatching,
    recommendedForYou: scored,
    becauseYouWatched,
    popularInYourLanguage: {
      language: primaryLang,
      items: langMatches.length > 0 ? langMatches : [...published].sort((a, b) => b.viewsCount - a.viewsCount),
    },
  };
}
