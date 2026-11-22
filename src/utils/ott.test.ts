import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildYouTubeEmbedUrl,
  calculateWatchProgress,
  canAccessAgeRating,
  computeRecommendations,
  extractYouTubeVideoId,
  formatDuration,
  formatMinutes,
  isSafeMediaUrl,
  maskStreamKey,
  slugify,
  validateSubscriptionAccess,
  type TitleSummary,
} from './ott';

test('extractYouTubeVideoId parses standard, short, embed, live, shorts, and bare IDs', () => {
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://youtu.be/aqz-KE-bpKQ?t=42'), 'aqz-KE-bpKQ');
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/embed/M7lc1UVf-VE'), 'M7lc1UVf-VE');
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/live/jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(extractYouTubeVideoId('https://youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  assert.equal(extractYouTubeVideoId('M7lc1UVf-VE'), 'M7lc1UVf-VE');
});

test('extractYouTubeVideoId rejects non-YouTube and unsafe URLs', () => {
  assert.equal(extractYouTubeVideoId('javascript:alert(1)'), null);
  assert.equal(extractYouTubeVideoId('https://evil.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=short'), null);
  assert.equal(extractYouTubeVideoId(''), null);
});

test('isSafeMediaUrl allows https and app asset paths while blocking unsafe schemes', () => {
  assert.equal(isSafeMediaUrl('/src/assets/images/poster.jpg'), true);
  assert.equal(isSafeMediaUrl('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'), true);
  assert.equal(isSafeMediaUrl('javascript:alert(1)'), false);
  assert.equal(isSafeMediaUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeMediaUrl('/src/assets/../../etc/passwd'), false);
});

test('buildYouTubeEmbedUrl produces official youtube embed URL with JS API enabled', () => {
  const url = buildYouTubeEmbedUrl('https://youtu.be/M7lc1UVf-VE', true);
  assert.ok(url?.startsWith('https://www.youtube.com/embed/M7lc1UVf-VE?'));
  assert.ok(url?.includes('enablejsapi=1'));
  assert.ok(url?.includes('autoplay=1'));
  assert.equal(buildYouTubeEmbedUrl('not-a-valid-youtube-url'), null);
});

test('duration and watch progress helpers compute accurate values', () => {
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3661), '1:01:01');
  assert.equal(formatMinutes(135), '2h 15m');
  assert.equal(formatMinutes(45), '45m');
  assert.equal(calculateWatchProgress(900, 3600), 25);
  assert.equal(calculateWatchProgress(5000, 3600), 100);
  assert.equal(calculateWatchProgress(10, 0), 0);
});

test('subscription tier, age rating, and stream key masking enforce access rules', () => {
  assert.equal(validateSubscriptionAccess('free', false), true);
  assert.equal(validateSubscriptionAccess('free', true), false);
  assert.equal(validateSubscriptionAccess('monthly', true), true);
  assert.equal(validateSubscriptionAccess('yearly', true), true);

  assert.equal(canAccessAgeRating('13+', '16+'), false);
  assert.equal(canAccessAgeRating('16+', '16+'), true);
  assert.equal(canAccessAgeRating('18+', '18+'), true);

  assert.equal(maskStreamKey('ks_live_secret_key_9f8a'), '••••9f8a');
  assert.equal(slugify('Midnight Protocol: Part II!'), 'midnight-protocol-part-ii');
});

test('computeRecommendations ranks matching genres, languages, and builds continue watching', () => {
  const sampleTitles: TitleSummary[] = [
    {
      id: 1,
      slug: 'noir-city',
      type: 'movie',
      title: 'Noir City',
      description: 'Detective thriller.',
      posterUrl: '/src/assets/images/p1.jpg',
      backdropUrl: '/src/assets/images/b1.jpg',
      videoSourceType: 'hls',
      videoUrl: 'https://example.com/1.m3u8',
      releaseYear: 2026,
      durationMinutes: 120,
      language: 'English',
      genres: ['Thriller', 'Crime'],
      castList: ['A'],
      director: 'D1',
      rating: 8.8,
      ageRating: '16+',
      category: 'Feature Film',
      tags: [],
      isFeatured: true,
      isTrending: true,
      top10Rank: 1,
      isLatest: true,
      isPremium: false,
      published: true,
      viewsCount: 90000,
      rightsOwner: 'Studio',
      rightsType: 'Licensed',
      allowedRegions: ['GLOBAL'],
    },
    {
      id: 2,
      slug: 'shadow-ledger',
      type: 'movie',
      title: 'Shadow Ledger',
      description: 'Espionage thriller.',
      posterUrl: '/src/assets/images/p2.jpg',
      backdropUrl: '/src/assets/images/b2.jpg',
      videoSourceType: 'hls',
      videoUrl: 'https://example.com/2.m3u8',
      releaseYear: 2026,
      durationMinutes: 112,
      language: 'English',
      genres: ['Thriller', 'Action'],
      castList: ['B'],
      director: 'D2',
      rating: 8.5,
      ageRating: '16+',
      category: 'Feature Film',
      tags: [],
      isFeatured: false,
      isTrending: false,
      top10Rank: null,
      isLatest: true,
      isPremium: true,
      published: true,
      viewsCount: 40000,
      rightsOwner: 'Studio',
      rightsType: 'Licensed',
      allowedRegions: ['GLOBAL'],
    },
    {
      id: 3,
      slug: 'golden-monsoon',
      type: 'movie',
      title: 'Golden Monsoon',
      description: 'Family drama.',
      posterUrl: '/src/assets/images/p3.jpg',
      backdropUrl: '/src/assets/images/b3.jpg',
      videoSourceType: 'hls',
      videoUrl: 'https://example.com/3.m3u8',
      releaseYear: 2025,
      durationMinutes: 138,
      language: 'Malayalam',
      genres: ['Drama'],
      castList: ['C'],
      director: 'D3',
      rating: 9.1,
      ageRating: '13+',
      category: 'Feature Film',
      tags: [],
      isFeatured: false,
      isTrending: true,
      top10Rank: 2,
      isLatest: false,
      isPremium: false,
      published: true,
      viewsCount: 150000,
      rightsOwner: 'Studio',
      rightsType: 'Licensed',
      allowedRegions: ['GLOBAL'],
    },
  ];

  const bundle = computeRecommendations(
    sampleTitles,
    [{ titleId: 1, progressSeconds: 1800, durationSeconds: 7200, completed: false }],
    [2],
    ['Malayalam', 'English']
  );

  assert.equal(bundle.continueWatching.length, 1);
  assert.equal(bundle.continueWatching[0].id, 1);
  assert.equal(bundle.continueWatching[0].progressPct, 25);
  assert.equal(bundle.becauseYouWatched?.anchorTitle, 'Noir City');
  assert.equal(bundle.becauseYouWatched?.items[0].id, 2);
  assert.equal(bundle.popularInYourLanguage.language, 'Malayalam');
  assert.equal(bundle.popularInYourLanguage.items[0].id, 3);
});
