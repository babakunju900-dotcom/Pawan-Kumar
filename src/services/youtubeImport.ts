import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { titles, youtubeImports } from '../db/schema.ts';
import { extractYouTubeVideoId } from '../utils/ott.ts';

export interface YouTubeImportPreview {
  importId: number;
  youtubeVideoId: string;
  youtubeUrl: string;
  isDuplicate: boolean;
  duplicateTitleId: number | null;
  duplicateTitleName: string | null;
  metadataSource: string;
  complianceNotice: string;
  isMatchedOfficialMovie: boolean;
  preview: {
    title: string;
    description: string;
    posterUrl: string;
    backdropUrl: string;
    thumbnailUrl: string;
    releaseYear: number;
    durationMinutes: number;
    language: string;
    genres: string[];
    castList: string[];
    director: string;
    rating: number;
    category: string;
    tags: string[];
    channelTitle: string;
    rightsOwner: string;
    rightsType: string;
  };
}

function parseIsoDurationMinutes(iso?: string): number {
  if (!iso) return 15;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 15;
  const hours = Number(match[1] || 0);
  const mins = Number(match[2] || 0);
  const secs = Number(match[3] || 0);
  return Math.max(1, hours * 60 + mins + Math.round(secs / 60));
}

function detectGenresFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const map: Array<[string, string[]]> = [
    ['Action', ['action', 'fight', 'chase', 'mission', 'war', 'agent']],
    ['Thriller', ['thriller', 'mystery', 'crime', 'detective', 'suspense', 'noir']],
    ['Sci-Fi', ['sci-fi', 'space', 'future', 'cyber', 'alien', 'orbital']],
    ['Drama', ['drama', 'family', 'life', 'emotional', 'story']],
    ['Comedy', ['comedy', 'funny', 'stand-up', 'laugh']],
    ['Documentary', ['documentary', 'making of', 'behind the scenes', 'nature', 'history']],
    ['Music', ['music', 'concert', 'live session', 'symphony', 'official audio']],
  ];
  const detected = map.filter(([, keys]) => keys.some((k) => lower.includes(k))).map(([g]) => g);
  return detected.length > 0 ? detected.slice(0, 3) : ['Video Feature'];
}

function detectLanguageFromCode(code?: string): string {
  if (!code) return 'English';
  const prefix = code.toLowerCase().slice(0, 2);
  const map: Record<string, string> = {
    en: 'English',
    hi: 'Hindi',
    ml: 'Malayalam',
    ta: 'Tamil',
    te: 'Telugu',
    kn: 'Kannada',
    es: 'Spanish',
    fr: 'French',
    ja: 'Japanese',
    ko: 'Korean',
  };
  return map[prefix] || 'English';
}

export async function fetchYouTubeMoviePreview(rawUrl: string, adminEmail: string): Promise<YouTubeImportPreview> {
  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) {
    throw new Error('Invalid YouTube URL or Video ID. Paste a valid youtube.com or youtu.be link.');
  }

  const normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // 1. Duplicate video detection in catalog
  const existingTitles = await db
    .select({ id: titles.id, title: titles.title })
    .from(titles)
    .where(eq(titles.youtubeVideoId, videoId))
    .limit(1);

  const isDuplicate = existingTitles.length > 0;
  const duplicateTitleId = existingTitles[0]?.id ?? null;
  const duplicateTitleName = existingTitles[0]?.title ?? null;

  const ytApiKey = process.env.YOUTUBE_API_KEY?.trim();
  const tmdbApiKey = process.env.TMDB_API_KEY?.trim();

  let ytTitle = '';
  let ytDescription = '';
  let ytChannel = 'YouTube Creator';
  let ytThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  let ytReleaseYear = new Date().getFullYear();
  let ytDurationMinutes = 12;
  let ytLanguage = 'English';
  let ytTags: string[] = [];
  let metadataSource = 'YouTube Official oEmbed';

  // 2. Fetch metadata through official YouTube Data API v3 (if key configured) or official YouTube oEmbed
  try {
    if (ytApiKey) {
      const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      apiUrl.searchParams.set('part', 'snippet,contentDetails,status');
      apiUrl.searchParams.set('id', videoId);
      apiUrl.searchParams.set('key', ytApiKey);

      const res = await fetch(apiUrl.toString(), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        throw new Error(`YouTube Data API returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        items?: Array<{
          snippet?: {
            title?: string;
            description?: string;
            channelTitle?: string;
            publishedAt?: string;
            defaultAudioLanguage?: string;
            defaultLanguage?: string;
            tags?: string[];
            thumbnails?: { maxres?: { url: string }; high?: { url: string }; medium?: { url: string } };
          };
          contentDetails?: { duration?: string };
          status?: { embeddable?: boolean };
        }>;
      };

      const item = data.items?.[0];
      if (!item) {
        throw new Error('YouTube video not found or unavailable.');
      }
      if (item.status && item.status.embeddable === false) {
        throw new Error('This YouTube video does not permit embedded playback per rights holder settings.');
      }

      ytTitle = item.snippet?.title || `YouTube Video (${videoId})`;
      ytDescription = item.snippet?.description || '';
      ytChannel = item.snippet?.channelTitle || 'YouTube Channel';
      ytThumbnail =
        item.snippet?.thumbnails?.maxres?.url ||
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        ytThumbnail;
      if (item.snippet?.publishedAt) {
        ytReleaseYear = new Date(item.snippet.publishedAt).getFullYear() || ytReleaseYear;
      }
      ytDurationMinutes = parseIsoDurationMinutes(item.contentDetails?.duration);
      ytLanguage = detectLanguageFromCode(item.snippet?.defaultAudioLanguage || item.snippet?.defaultLanguage);
      ytTags = (item.snippet?.tags || []).slice(0, 8);
      metadataSource = 'YouTube Data API v3';
    } else {
      const oembedUrl = new URL('https://www.youtube.com/oembed');
      oembedUrl.searchParams.set('url', normalizedUrl);
      oembedUrl.searchParams.set('format', 'json');
      const res = await fetch(oembedUrl.toString(), { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        ytTitle = data.title || `YouTube Video (${videoId})`;
        ytChannel = data.author_name || 'YouTube Channel';
        ytThumbnail = data.thumbnail_url || ytThumbnail;
        ytDescription = `Official embedded YouTube presentation from ${ytChannel}. Configure YOUTUBE_API_KEY in server secrets for full YouTube Data API v3 description, duration, and language metadata.`;
      } else {
        throw new Error(`YouTube oEmbed returned HTTP ${res.status}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to reach YouTube metadata service.';
    // Log failed import so admin can inspect & retry from Import History
    await db.insert(youtubeImports).values({
      youtubeVideoId: videoId,
      youtubeUrl: normalizedUrl,
      fetchedTitle: '',
      status: 'failed',
      errorMessage: message,
      payloadJson: { rawUrl },
      createdBy: adminEmail,
    });
    throw new Error(`YouTube metadata fetch failed: ${message}`);
  }

  // 3. Optional TMDB Movie Matching (only when TMDB_API_KEY is configured)
  let posterUrl = ytThumbnail;
  let backdropUrl = ytThumbnail;
  let description = ytDescription;
  let genres = detectGenresFromText(`${ytTitle} ${ytDescription}`);
  let castList: string[] = [];
  let director = ytChannel;
  let rating = 8.0;
  let isMatchedOfficialMovie = false;

  if (tmdbApiKey) {
    try {
      const cleanQuery = ytTitle
        .replace(/\(.*?\)|\[.*?\]|full movie|official trailer|4k|hd|1080p/gi, '')
        .trim();
      const searchUrl = new URL('https://api.themoviedb.org/3/search/movie');
      searchUrl.searchParams.set('api_key', tmdbApiKey);
      searchUrl.searchParams.set('query', cleanQuery || ytTitle);

      const searchRes = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(8000) });
      if (searchRes.ok) {
        const searchData = (await searchRes.json()) as {
          results?: Array<{
            id: number;
            title?: string;
            overview?: string;
            poster_path?: string;
            backdrop_path?: string;
            release_date?: string;
            vote_average?: number;
            original_language?: string;
          }>;
        };
        const match = searchData.results?.[0];
        if (match && match.id) {
          isMatchedOfficialMovie = true;
          metadataSource = `${metadataSource} + TMDB Match`;
          if (match.poster_path) posterUrl = `https://image.tmdb.org/t/p/w500${match.poster_path}`;
          if (match.backdrop_path) backdropUrl = `https://image.tmdb.org/t/p/original${match.backdrop_path}`;
          if (match.overview) description = match.overview;
          if (match.release_date) {
            const yr = Number(match.release_date.slice(0, 4));
            if (yr > 1900) ytReleaseYear = yr;
          }
          if (match.vote_average) rating = Number(match.vote_average.toFixed(1));
          if (match.original_language) ytLanguage = detectLanguageFromCode(match.original_language);

          // Fetch credits & genres from TMDB movie details
          const detailsUrl = new URL(`https://api.themoviedb.org/3/movie/${match.id}`);
          detailsUrl.searchParams.set('api_key', tmdbApiKey);
          detailsUrl.searchParams.set('append_to_response', 'credits');
          const detailRes = await fetch(detailsUrl.toString(), { signal: AbortSignal.timeout(8000) });
          if (detailRes.ok) {
            const detailData = (await detailRes.json()) as {
              runtime?: number;
              genres?: Array<{ name: string }>;
              credits?: {
                cast?: Array<{ name: string }>;
                crew?: Array<{ name: string; job: string }>;
              };
            };
            if (detailData.runtime) ytDurationMinutes = detailData.runtime;
            if (detailData.genres?.length) genres = detailData.genres.map((g) => g.name).slice(0, 4);
            if (detailData.credits?.cast?.length) {
              castList = detailData.credits.cast.slice(0, 6).map((c) => c.name);
            }
            const dir = detailData.credits?.crew?.find((c) => c.job === 'Director');
            if (dir?.name) director = dir.name;
          }
        }
      }
    } catch (tmdbErr) {
      console.warn('Optional TMDB enrichment skipped:', tmdbErr);
    }
  }

  const category = isMatchedOfficialMovie ? 'Official YouTube Embed · Movie' : 'YouTube Video Feature';
  const complianceNotice = isMatchedOfficialMovie
    ? 'Matched with TMDB metadata. Verify you hold official YouTube embedding/distribution authorization before publishing.'
    : 'Identified as an embedded YouTube video (not auto-labeled as a licensed studio movie). Playback uses the official YouTube Embedded Player with YouTube branding.';

  const previewPayload = {
    title: ytTitle,
    description,
    posterUrl,
    backdropUrl,
    thumbnailUrl: ytThumbnail,
    releaseYear: ytReleaseYear,
    durationMinutes: ytDurationMinutes,
    language: ytLanguage,
    genres,
    castList,
    director,
    rating,
    category,
    tags: ytTags.length > 0 ? ytTags : ['youtube-embed', ...genres.map((g) => g.toLowerCase())],
    channelTitle: ytChannel,
    rightsOwner: ytChannel,
    rightsType: 'Official YouTube Embedded Player',
  };

  const [record] = await db
    .insert(youtubeImports)
    .values({
      youtubeVideoId: videoId,
      youtubeUrl: normalizedUrl,
      fetchedTitle: ytTitle,
      matchedTitleId: duplicateTitleId,
      status: isDuplicate ? 'duplicate' : 'preview',
      errorMessage: isDuplicate ? `Already exists in catalog as "${duplicateTitleName}"` : '',
      payloadJson: previewPayload,
      createdBy: adminEmail,
    })
    .returning();

  return {
    importId: record.id,
    youtubeVideoId: videoId,
    youtubeUrl: normalizedUrl,
    isDuplicate,
    duplicateTitleId,
    duplicateTitleName,
    metadataSource,
    complianceNotice,
    isMatchedOfficialMovie,
    preview: previewPayload,
  };
}
