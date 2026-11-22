import crypto from 'node:crypto';
import { count } from 'drizzle-orm';
import { db } from './index.ts';
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
} from './schema.ts';

const IMG = {
  heroThriller: '/src/assets/images/hero_featured_thriller_1795368971199.jpg',
  midnightProtocol: '/src/assets/images/poster_midnight_protocol_1795368981364.jpg',
  goldenMonsoon: '/src/assets/images/poster_golden_monsoon_1795368963686.jpg',
  orbitalZero: '/src/assets/images/poster_orbital_zero_1795368962773.jpg',
  velvetDynasty: '/src/assets/images/poster_velvet_dynasty_1795368968351.jpg',
  realityHouse: '/src/assets/images/reality_glass_house_1795368962146.jpg',
  liveArena: '/src/assets/images/live_concert_arena_1795368962106.jpg',
  crimsonCircuit: '/src/assets/images/poster_crimson_circuit_1795368962140.jpg',
};

// Publicly authorized adaptive HLS demo streams (Mux / Blender Foundation Creative Commons)
const HLS_STREAMS = {
  mux: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  sintel: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
  tearsOfSteel: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
};

let seedPromise: Promise<void> | null = null;
let seeded = false;

export async function ensureDatabaseSeeded() {
  if (seeded) return;
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      const [{ value: titleCount }] = await db.select({ value: count() }).from(titles);
      if (Number(titleCount) > 0) {
        seeded = true;
        return;
      }

      // 1. Subscription Plans
      await db
        .insert(subscriptionPlans)
        .values([
          {
            code: 'free',
            name: 'Free Cinema',
            priceInr: 0,
            priceUsd: 0,
            billingCycle: 'Forever Free',
            featuresJson: [
              'Ad-supported movies & select originals',
              'HD 720p adaptive playback',
              'Live TV news & open broadcast channels',
              'Public reality show main camera preview',
            ],
            maxQuality: '720p',
            adsSupported: true,
            isActive: true,
          },
          {
            code: 'monthly',
            name: 'KinoStage Premium Monthly',
            priceInr: 299,
            priceUsd: 4.99,
            billingCycle: 'Per Month',
            featuresJson: [
              'Ad-free 4K HDR movies & original web series',
              'Full 24/7 Multi-Camera Reality House access (all 9 cameras)',
              'All Premium Live TV channels & sports arenas',
              'Live chat priority badges & multi-device resume',
            ],
            maxQuality: '4K HDR',
            adsSupported: false,
            isActive: true,
          },
          {
            code: 'yearly',
            name: 'KinoStage Annual VIP',
            priceInr: 2499,
            priceUsd: 39.99,
            billingCycle: 'Per Year (Save 30%)',
            featuresJson: [
              'Everything in Premium Monthly, ad-free in 4K Dolby Atmos',
              'Exclusive Live Premieres, concerts & red-carpet streams',
              'VIP Reality Show voting power & backstage director cuts',
              'Early access to theatrical digital releases',
            ],
            maxQuality: '4K HDR + Atmos',
            adsSupported: false,
            isActive: true,
          },
        ])
        .onConflictDoNothing();

      // 2. Default Platform Settings (UPI, QR, Gateway, Chat Moderation)
      await db
        .insert(platformSettings)
        .values([
          {
            key: 'payment_config',
            valueJson: {
              upiId: 'kinostage.ott@okhdfcbank',
              merchantName: 'KinoStage Digital Cinema Pvt Ltd',
              qrNote: 'KinoStage Premium Verification',
              gatewayProvider: 'Razorpay / Stripe (Test Ready)',
              gatewayEnabled: Boolean(process.env.PAYMENT_GATEWAY_KEY),
              requireAdminReconciliation: true,
            },
          },
          {
            key: 'chat_controls',
            valueJson: {
              slowModeSeconds: 3,
              chatDisabled: false,
              blockedUids: [],
            },
          },
        ])
        .onConflictDoNothing();

      // 3. Seed Movies & Web Series
      const insertedTitles = await db
        .insert(titles)
        .values([
          {
            slug: 'rain-over-kobe',
            type: 'movie',
            title: 'Rain Over Kobe',
            description:
              'When an encrypted maritime ledger vanishes during a typhoon blackout, retired investigator Kenji Sato has twelve hours to trace a corporate syndicate across neon-drenched harbor bridges before the final freighter departs.',
            posterUrl: IMG.midnightProtocol,
            backdropUrl: IMG.heroThriller,
            trailerYoutubeId: 'YE7VzlLtp-4',
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.mux,
            releaseYear: 2026,
            durationMinutes: 134,
            language: 'English',
            genres: ['Neo-Noir', 'Thriller', 'Crime'],
            castList: ['Hiroshi Takeda', 'Elena Vance', 'Vikram Dev', 'Mei-Ling Zhou'],
            director: 'Arjun Subramanian',
            rating: 9.1,
            ageRating: '16+',
            category: 'KinoStage Original Film',
            tags: ['noir', 'detective', 'rain', 'thriller', '4k-hdr'],
            isFeatured: true,
            isTrending: true,
            top10Rank: 1,
            isLatest: true,
            isPremium: false,
            published: true,
            viewsCount: 284500,
            rightsOwner: 'KinoStage Studios International',
            rightsType: 'Global Exclusive OTT Rights',
            allowedRegions: ['GLOBAL'],
          },
          {
            slug: 'golden-monsoon',
            type: 'movie',
            title: 'Golden Monsoon',
            description:
              'Inside an ancestral Malabar courtyard house during the heaviest monsoon in half a century, three estranged sisters reunite to unlock their late grandmother’s hidden brass vault and confront a sixty-year family secret.',
            posterUrl: IMG.goldenMonsoon,
            backdropUrl: IMG.goldenMonsoon,
            trailerYoutubeId: 'aqz-KE-bpKQ',
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.sintel,
            releaseYear: 2026,
            durationMinutes: 142,
            language: 'Malayalam',
            genres: ['Drama', 'Mystery', 'Heritage'],
            castList: ['Revathi Menon', 'Fahad Nambiar', 'Ananya Nair', 'Siddharth Rao'],
            director: 'Meera Panicker',
            rating: 9.3,
            ageRating: '13+',
            category: 'Prestige Cinema',
            tags: ['malayalam', 'family-drama', 'festival-winner', 'monsoon'],
            isFeatured: false,
            isTrending: true,
            top10Rank: 2,
            isLatest: true,
            isPremium: false,
            published: true,
            viewsCount: 241900,
            rightsOwner: 'Malabar Frame Collective',
            rightsType: 'Licensed SVOD Worldwide',
            allowedRegions: ['GLOBAL'],
          },
          {
            slug: 'orbital-zero',
            type: 'movie',
            title: 'Orbital Zero',
            description:
              'After a solar flare severs telemetry aboard Deep Relay Station 9 above Saturn’s outer ring, flight engineer Dr. Mara Lind must execute a silent manual burn with only forty minutes of oxygen remaining.',
            posterUrl: IMG.orbitalZero,
            backdropUrl: IMG.orbitalZero,
            trailerYoutubeId: 'YE7VzlLtp-4',
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.tearsOfSteel,
            releaseYear: 2026,
            durationMinutes: 128,
            language: 'English',
            genres: ['Sci-Fi', 'Thriller', 'Adventure'],
            castList: ['Claire Lindqvist', 'Devon Brooks', 'Rohan Kapoor'],
            director: 'Tomasz Kowalski',
            rating: 8.9,
            ageRating: '13+',
            category: 'IMAX Home Release',
            tags: ['space', 'hard-scifi', 'survival', 'dolby-atmos'],
            isFeatured: false,
            isTrending: true,
            top10Rank: 3,
            isLatest: true,
            isPremium: true,
            published: true,
            viewsCount: 198400,
            rightsOwner: 'Helios Pictures',
            rightsType: 'Premium SVOD Exclusive',
            allowedRegions: ['GLOBAL'],
          },
          {
            slug: 'crimson-circuit',
            type: 'movie',
            title: 'Crimson Circuit',
            description:
              'An underground endurance driver returns to the fog-choked Alpine midnight circuit to clear his brother’s debt against a ruthless syndicate that controls every hairpin turn.',
            posterUrl: IMG.crimsonCircuit,
            backdropUrl: IMG.crimsonCircuit,
            trailerYoutubeId: 'aqz-KE-bpKQ',
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.mux,
            releaseYear: 2025,
            durationMinutes: 116,
            language: 'Hindi',
            genres: ['Action', 'Motorsport', 'Thriller'],
            castList: ['Kabir Malhotra', 'Nadia Rossi', 'Marcus Reid'],
            director: 'Vikramaditya Sen',
            rating: 8.6,
            ageRating: '16+',
            category: 'Action Blockbuster',
            tags: ['racing', 'action', 'alpine', 'adrenaline'],
            isFeatured: false,
            isTrending: true,
            top10Rank: 4,
            isLatest: false,
            isPremium: false,
            published: true,
            viewsCount: 175200,
            rightsOwner: 'Apex Motion Pictures',
            rightsType: 'Licensed OTT Distribution',
            allowedRegions: ['GLOBAL'],
          },
          {
            slug: 'midnight-protocol',
            type: 'movie',
            title: 'Midnight Protocol',
            description:
              'A counter-intelligence analyst uncovers a rogue blackout algorithm embedded inside four metropolitan power grids, triggering a tense overnight race across Mumbai, Zurich, and Singapore.',
            posterUrl: IMG.midnightProtocol,
            backdropUrl: IMG.heroThriller,
            trailerYoutubeId: 'YE7VzlLtp-4',
            videoSourceType: 'youtube',
            videoUrl: 'https://www.youtube.com/watch?v=YE7VzlLtp-4',
            youtubeVideoId: 'YE7VzlLtp-4',
            releaseYear: 2026,
            durationMinutes: 124,
            language: 'Hindi',
            genres: ['Espionage', 'Thriller', 'Action'],
            castList: ['Aarav Khanna', 'Zoya Mirza', 'Julian Sterling'],
            director: 'Nikhil Chatterjee',
            rating: 8.8,
            ageRating: '16+',
            category: 'Official YouTube Premiere',
            tags: ['spy', 'cyber', 'youtube-official', 'thriller'],
            isFeatured: false,
            isTrending: true,
            top10Rank: 5,
            isLatest: true,
            isPremium: false,
            published: true,
            viewsCount: 162300,
            rightsOwner: 'Blender Foundation / Official YouTube Embed',
            rightsType: 'Official YouTube Embedded Broadcast',
            allowedRegions: ['GLOBAL'],
          },
          {
            slug: 'velvet-dynasty',
            type: 'series',
            title: 'Velvet Dynasty',
            description:
              'Set inside the glass-walled boardrooms of South Mumbai’s oldest shipping conglomerate, two rival heirs wage a razor-sharp succession war while a federal prosecutor quietly builds an airtight case.',
            posterUrl: IMG.velvetDynasty,
            backdropUrl: IMG.velvetDynasty,
            trailerYoutubeId: 'aqz-KE-bpKQ',
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.mux,
            releaseYear: 2026,
            durationMinutes: 52,
            language: 'Hindi',
            genres: ['Drama', 'Crime', 'Corporate'],
            castList: ['Raghav Oberoi', 'Tara Deshmukh', 'Karan Gill', 'Shreya Kulkarni'],
            director: 'Devika Joshi',
            rating: 9.2,
            ageRating: '16+',
            category: 'Original Web Series',
            tags: ['succession', 'mumbai', 'prestige-drama', 'series'],
            isFeatured: false,
            isTrending: true,
            top10Rank: 6,
            isLatest: true,
            isPremium: false,
            published: true,
            viewsCount: 312000,
            rightsOwner: 'KinoStage Originals',
            rightsType: 'Exclusive Series License',
            allowedRegions: ['GLOBAL'],
          },
          {
            slug: 'eclipse-protocol-series',
            type: 'series',
            title: 'Eclipse Station',
            description:
              'A gripping anthology web series chronicling the first international lunar research colony as subterranean tremors reveal an unexpected geological anomaly.',
            posterUrl: IMG.orbitalZero,
            backdropUrl: IMG.orbitalZero,
            trailerYoutubeId: 'YE7VzlLtp-4',
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.tearsOfSteel,
            releaseYear: 2025,
            durationMinutes: 48,
            language: 'English',
            genres: ['Sci-Fi', 'Mystery', 'Drama'],
            castList: ['Sora Takahashi', 'Liam O’Connor', 'Priya Nair'],
            director: 'Hannah Lindholm',
            rating: 8.7,
            ageRating: '13+',
            category: 'Original Web Series',
            tags: ['lunar', 'sci-fi-series', 'mystery'],
            isFeatured: false,
            isTrending: false,
            top10Rank: 7,
            isLatest: false,
            isPremium: true,
            published: true,
            viewsCount: 145800,
            rightsOwner: 'KinoStage Originals',
            rightsType: 'Exclusive Series License',
            allowedRegions: ['GLOBAL'],
          },
          {
            slug: 'symphony-of-ash',
            type: 'movie',
            title: 'Symphony of Ash',
            description:
              'An intimate musical portrait following an acclaimed concert conductor staging one final live arena performance against impossible odds.',
            posterUrl: IMG.liveArena,
            backdropUrl: IMG.liveArena,
            trailerYoutubeId: 'aqz-KE-bpKQ',
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.sintel,
            releaseYear: 2025,
            durationMinutes: 109,
            language: 'Tamil',
            genres: ['Music', 'Drama', 'Documentary'],
            castList: ['Karthik Sundaram', 'Lakshmi Krishnan'],
            director: 'Prashanth Mani',
            rating: 8.5,
            ageRating: 'U',
            category: 'Music Documentary',
            tags: ['concert', 'orchestra', 'tamil', 'documentary'],
            isFeatured: false,
            isTrending: false,
            top10Rank: 8,
            isLatest: true,
            isPremium: false,
            published: true,
            viewsCount: 98400,
            rightsOwner: 'Crescendo Film Works',
            rightsType: 'Authorized OTT Streaming',
            allowedRegions: ['GLOBAL'],
          },
        ])
        .returning();

      // 4. Seasons & Episodes for Web Series
      const velvetSeries = insertedTitles.find((t) => t.slug === 'velvet-dynasty');
      const eclipseSeries = insertedTitles.find((t) => t.slug === 'eclipse-protocol-series');

      if (velvetSeries) {
        const [s1, s2] = await db
          .insert(seasons)
          .values([
            { seriesId: velvetSeries.id, seasonNumber: 1, title: 'Season 1: The Harbor Ledger', releaseYear: 2025 },
            { seriesId: velvetSeries.id, seasonNumber: 2, title: 'Season 2: Hostile Takeover', releaseYear: 2026 },
          ])
          .returning();

        await db.insert(episodes).values([
          {
            seasonId: s1.id,
            seriesId: velvetSeries.id,
            episodeNumber: 1,
            title: 'The 40th Floor',
            description: 'The patriarch’s sudden hospitalization fractures the board before the morning bell rings.',
            posterUrl: IMG.velvetDynasty,
            durationMinutes: 54,
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.mux,
            releaseDate: '2025-11-04',
          },
          {
            seasonId: s1.id,
            seriesId: velvetSeries.id,
            episodeNumber: 2,
            title: 'Paper Vessels',
            description: 'Tara discovers three offshore shell companies tied directly to the docklands expansion.',
            posterUrl: IMG.heroThriller,
            durationMinutes: 49,
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.sintel,
            releaseDate: '2025-11-11',
          },
          {
            seasonId: s1.id,
            seriesId: velvetSeries.id,
            episodeNumber: 3,
            title: 'Silent Majority',
            description: 'A surprise proxy vote turns an intimate gala dinner into an open courtroom battle.',
            posterUrl: IMG.goldenMonsoon,
            durationMinutes: 56,
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.tearsOfSteel,
            releaseDate: '2025-11-18',
          },
          {
            seasonId: s2.id,
            seriesId: velvetSeries.id,
            episodeNumber: 1,
            title: 'Monsoon Clauses',
            description: 'New regulators freeze the maritime merger while a whistleblower enters the penthouse.',
            posterUrl: IMG.velvetDynasty,
            durationMinutes: 58,
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.mux,
            releaseDate: '2026-10-15',
          },
        ]);
      }

      if (eclipseSeries) {
        const [es1] = await db
          .insert(seasons)
          .values([{ seriesId: eclipseSeries.id, seasonNumber: 1, title: 'Season 1: Mare Tranquillitatis', releaseYear: 2025 }])
          .returning();
        await db.insert(episodes).values([
          {
            seasonId: es1.id,
            seriesId: eclipseSeries.id,
            episodeNumber: 1,
            title: 'Dustfall',
            description: 'Seismic sensors pick up a repeating harmonic signal beneath Crater Sector 4.',
            posterUrl: IMG.orbitalZero,
            durationMinutes: 48,
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.tearsOfSteel,
            releaseDate: '2025-09-01',
          },
          {
            seasonId: es1.id,
            seriesId: eclipseSeries.id,
            episodeNumber: 2,
            title: 'Dark Side Telemetry',
            description: 'Communication blackout isolates the drilling rig during lunar nightfall.',
            posterUrl: IMG.orbitalZero,
            durationMinutes: 51,
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.mux,
            releaseDate: '2025-09-08',
          },
        ]);
      }

      // 5. Initial Reviews
      if (insertedTitles[0]) {
        await db.insert(reviews).values([
          {
            titleId: insertedTitles[0].id,
            userUid: 'seed-critic-1',
            username: 'Anand Krishnan',
            rating: 5,
            comment: 'Razor-sharp cinematography and a haunting score. The bridge sequence belongs in a cinema hall.',
          },
          {
            titleId: insertedTitles[0].id,
            userUid: 'seed-critic-2',
            username: 'Maya Deshpande',
            rating: 4,
            comment: 'Relentless pacing from start to finish with incredible atmospheric sound design.',
          },
        ]);
      }

      // 6. Bigg Boss-Inspired 24/7 Multi-Camera Reality Show
      const [glassHouse] = await db
        .insert(realityShows)
        .values([
          {
            name: 'The Glass House 24/7',
            slug: 'the-glass-house',
            logoUrl: IMG.realityHouse,
            coverUrl: IMG.realityHouse,
            description:
              'Fourteen iconic personalities locked inside a custom architectural compound for 100 days with zero outside contact. Switch freely across 9 live studio camera angles, vote in real-time eliminations, and join live audience polls.',
            isLive: true,
            episodeSchedule: 'Prime Episode Daily 21:00 IST · 24/7 Uncut Multi-Cam Live',
            viewerCount: 48920,
          },
        ])
        .returning();

      if (glassHouse) {
        const cameraSpecs = [
          { name: 'Main Camera', zone: 'Director Cut', url: HLS_STREAMS.mux, viewers: 18420, online: true },
          { name: 'Camera 1', zone: 'Sunken Firepit', url: HLS_STREAMS.sintel, viewers: 7410, online: true },
          { name: 'Camera 2', zone: 'Confession Booth', url: HLS_STREAMS.tearsOfSteel, viewers: 5180, online: true },
          { name: 'Camera 3', zone: 'Task Arena', url: HLS_STREAMS.mux, viewers: 4290, online: true },
          { name: 'Camera 4', zone: 'Captain Suite', url: HLS_STREAMS.sintel, viewers: 3120, online: true },
          { name: 'Living Room Camera', zone: 'Living Lounge', url: HLS_STREAMS.mux, viewers: 6340, online: true },
          { name: 'Garden Camera', zone: 'Pool & Courtyard', url: HLS_STREAMS.tearsOfSteel, viewers: 4980, online: true },
          { name: 'Kitchen Camera', zone: 'Chef Island', url: HLS_STREAMS.sintel, viewers: 3860, online: true },
          { name: 'Bedroom Camera', zone: 'Dormitory Wing', url: HLS_STREAMS.mux, viewers: 1920, online: false },
        ];

        await db.insert(realityCameras).values(
          cameraSpecs.map((cam, idx) => {
            const secret = crypto.randomBytes(12).toString('hex');
            return {
              showId: glassHouse.id,
              name: cam.name,
              zone: cam.zone,
              streamType: 'hls',
              hlsPlaybackUrl: cam.url,
              rtmpIngestUrl: `rtmps://ingest.kinostage.live/house-cam-${idx + 1}`,
              streamKeyHash: crypto.createHash('sha256').update(secret).digest('hex'),
              streamKeyHint: `••••${secret.slice(-4)}`,
              isOnline: cam.online,
              viewerCount: cam.viewers,
              isRecording: cam.online,
              sortOrder: idx + 1,
            };
          })
        );

        await db.insert(realityParticipants).values([
          {
            showId: glassHouse.id,
            name: 'Aryan Verma',
            role: 'Film Actor · House Captain',
            bio: 'Known for calm diplomacy and decisive weekly task strategy.',
            avatarUrl: IMG.velvetDynasty,
            status: 'active',
            votesCount: 14280,
          },
          {
            showId: glassHouse.id,
            name: 'Rhea Sen',
            role: 'Indie Musician',
            bio: 'Outspoken strategist currently nominated for Sunday eviction.',
            avatarUrl: IMG.goldenMonsoon,
            status: 'nominated',
            votesCount: 18640,
          },
          {
            showId: glassHouse.id,
            name: 'Kabir Gill',
            role: 'Pro Motorsport Driver',
            bio: 'Undefeated in physical endurance challenges across four weeks.',
            avatarUrl: IMG.crimsonCircuit,
            status: 'nominated',
            votesCount: 16910,
          },
          {
            showId: glassHouse.id,
            name: 'Nisha Thomas',
            role: 'Broadcast Journalist',
            bio: 'Sharp observer who keeps house alliances on their toes.',
            avatarUrl: IMG.heroThriller,
            status: 'active',
            votesCount: 11420,
          },
          {
            showId: glassHouse.id,
            name: 'Devansh Mehta',
            role: 'Stand-up Comedian',
            bio: 'Brings midnight humor and unpredictable twists to nominations.',
            avatarUrl: IMG.orbitalZero,
            status: 'nominated',
            votesCount: 13205,
          },
          {
            showId: glassHouse.id,
            name: 'Sanya Kapoor',
            role: 'Choreographer',
            bio: 'Eliminated in Week 3 after a narrow public vote.',
            avatarUrl: IMG.liveArena,
            status: 'evicted',
            votesCount: 5400,
          },
        ]);

        await db.insert(realityEpisodes).values([
          {
            showId: glassHouse.id,
            title: 'Weekend Grand Eviction Night · Live Special',
            kind: 'upcoming',
            airDate: 'Sunday · 21:00 IST',
            durationMinutes: 90,
            thumbnailUrl: IMG.liveArena,
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.mux,
          },
          {
            showId: glassHouse.id,
            title: 'Day 42: The Midnight Captaincy Betrayal',
            kind: 'previous',
            airDate: 'Yesterday · 21:00 IST',
            durationMinutes: 58,
            thumbnailUrl: IMG.realityHouse,
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.sintel,
          },
          {
            showId: glassHouse.id,
            title: 'Highlight: Firepit Nomination Showdown (Uncut)',
            kind: 'highlight',
            airDate: '2 days ago',
            durationMinutes: 14,
            thumbnailUrl: IMG.realityHouse,
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.tearsOfSteel,
          },
          {
            showId: glassHouse.id,
            title: '24/7 Garden Camera Full Replay — Night Shift',
            kind: 'replay',
            airDate: '3 days ago',
            durationMinutes: 120,
            thumbnailUrl: IMG.goldenMonsoon,
            videoSourceType: 'hls',
            videoUrl: HLS_STREAMS.mux,
          },
        ]);
      }

      // 7. Live TV Channels
      await db.insert(liveChannels).values([
        {
          name: 'KinoStage Cinema HD',
          logoUrl: IMG.heroThriller,
          bannerUrl: IMG.heroThriller,
          category: 'Movies',
          language: 'English',
          streamType: 'hls',
          hlsUrl: HLS_STREAMS.mux,
          status: 'live',
          currentProgram: 'Director’s Cut Showcase: Rain Over Kobe',
          scheduleJson: [
            { time: '18:00', program: 'Noir Classics Marathon', duration: '120m' },
            { time: '20:00', program: 'Director’s Cut Showcase: Rain Over Kobe', duration: '135m' },
            { time: '22:15', program: 'Late Night World Cinema', duration: '110m' },
          ],
          viewerCount: 12480,
          isPremium: false,
        },
        {
          name: 'Stage 24/7 Reality TV',
          logoUrl: IMG.realityHouse,
          bannerUrl: IMG.realityHouse,
          category: 'Reality',
          language: 'Hindi',
          streamType: 'hls',
          hlsUrl: HLS_STREAMS.sintel,
          status: 'live',
          currentProgram: 'The Glass House: Live Uncut Feed',
          scheduleJson: [
            { time: '19:00', program: 'House Recap & Fan Pulse', duration: '60m' },
            { time: '20:00', program: 'The Glass House: Live Uncut Feed', duration: '180m' },
            { time: '23:00', program: 'After-Hours Confessionals', duration: '90m' },
          ],
          viewerCount: 28940,
          isPremium: false,
        },
        {
          name: 'Arena Sports & Motorsport Live',
          logoUrl: IMG.crimsonCircuit,
          bannerUrl: IMG.crimsonCircuit,
          category: 'Sports',
          language: 'English',
          streamType: 'hls',
          hlsUrl: HLS_STREAMS.tearsOfSteel,
          status: 'live',
          currentProgram: 'Alpine Night Endurance Qualifying',
          scheduleJson: [
            { time: '17:30', program: 'Paddock Warmup Live', duration: '90m' },
            { time: '19:00', program: 'Alpine Night Endurance Qualifying', duration: '120m' },
            { time: '21:00', program: 'Post-Race Telemetry Breakdown', duration: '60m' },
          ],
          viewerCount: 19310,
          isPremium: true,
        },
        {
          name: 'KinoStage Premiere Music',
          logoUrl: IMG.liveArena,
          bannerUrl: IMG.liveArena,
          category: 'Music & Events',
          language: 'Malayalam',
          streamType: 'youtube',
          hlsUrl: HLS_STREAMS.mux,
          youtubeEmbedId: 'jfKfPfyJRdk',
          status: 'live',
          currentProgram: 'Acoustic Sessions & Film Score Radio',
          scheduleJson: [
            { time: '16:00', program: 'South Indian Cinema Scores', duration: '120m' },
            { time: '18:00', program: 'Acoustic Sessions & Film Score Radio', duration: '240m' },
          ],
          viewerCount: 8420,
          isPremium: false,
        },
      ]);

      // 8. Live Events & Premieres
      await db.insert(liveEvents).values([
        {
          title: 'Global Red Carpet Premiere: Rain Over Kobe',
          description: 'Live Q&A with director Arjun Subramanian and the full cast straight from the Mumbai IMAX gala.',
          bannerUrl: IMG.liveArena,
          category: 'World Premiere',
          startsAt: 'Tonight · 20:30 IST',
          status: 'live',
          streamType: 'hls',
          streamUrl: HLS_STREAMS.mux,
          isPremium: false,
          rsvpCount: 34200,
        },
        {
          title: 'The Glass House: Grand Mid-Season Twist Live',
          description: 'Wildcard entrants enter the compound live on stage with instant audience voting.',
          bannerUrl: IMG.realityHouse,
          category: 'Reality Special',
          startsAt: 'Tomorrow · 21:00 IST',
          status: 'upcoming',
          streamType: 'hls',
          streamUrl: HLS_STREAMS.sintel,
          isPremium: true,
          rsvpCount: 51800,
        },
        {
          title: 'Symphony of Cinema: Live Orchestra Concert',
          description: 'An 80-piece orchestra performs iconic movie themes in Dolby Atmos live from Chennai.',
          bannerUrl: IMG.goldenMonsoon,
          category: 'Live Concert',
          startsAt: 'Saturday · 19:30 IST',
          status: 'upcoming',
          streamType: 'hls',
          streamUrl: HLS_STREAMS.tearsOfSteel,
          isPremium: true,
          rsvpCount: 19450,
        },
      ]);

      // 9. Seed Live Chat & Polls for Reality Show Room
      const realityRoomId = glassHouse ? `reality-${glassHouse.id}` : 'reality-1';
      await db.insert(liveChatMessages).values([
        {
          roomId: realityRoomId,
          userUid: 'mod-1',
          username: 'KinoStage Host',
          userRole: 'moderator',
          message: 'Welcome to The Glass House 24/7 Live! Switch across 9 studio cameras and cast your eviction vote below.',
          isPinned: true,
        },
        {
          roomId: realityRoomId,
          userUid: 'fan-1',
          username: 'RohanM',
          userRole: 'user',
          message: 'Switch to Kitchen Camera right now — Rhea and Kabir are planning tomorrow’s nomination!',
          isPinned: false,
        },
        {
          roomId: realityRoomId,
          userUid: 'fan-2',
          username: 'Aisha_Cinema',
          userRole: 'user',
          message: 'Garden Camera audio is super crisp tonight. Voting to save Rhea!',
          isPinned: false,
        },
      ]);

      await db.insert(livePolls).values([
        {
          roomId: realityRoomId,
          question: 'Who deserves immunity from this week’s eviction?',
          optionsJson: [
            { id: 'opt1', label: 'Rhea Sen', votes: 1420 },
            { id: 'opt2', label: 'Kabir Gill', votes: 1185 },
            { id: 'opt3', label: 'Devansh Mehta', votes: 890 },
          ],
          isActive: true,
        },
      ]);

      // 10. Seed Studio Stream (Own Live Streaming Studio sample)
      const studioSecret = crypto.randomBytes(16).toString('hex');
      await db.insert(studioStreams).values([
        {
          hostUid: 'seed-admin',
          hostName: 'KinoStage Broadcast Desk',
          title: 'Director’s Roundtable — Autumn Cinema Lineup',
          description: 'Live studio broadcast discussing upcoming originals, behind-the-scenes cinematography, and viewer Q&A.',
          category: 'Studio Broadcast',
          thumbnailUrl: IMG.liveArena,
          status: 'idle',
          rtmpIngestUrl: 'rtmps://ingest.kinostage.live/studio',
          hlsPlaybackUrl: HLS_STREAMS.mux,
          streamKeyHash: crypto.createHash('sha256').update(studioSecret).digest('hex'),
          streamKeyHint: `••••${studioSecret.slice(-4)}`,
          recordingUrl: HLS_STREAMS.sintel,
          saveRecording: true,
          viewerCount: 0,
        },
      ]);

      // 11. Seed Notifications, Sample Users, Transactions & Compliance Record
      await db.insert(users).values([
        {
          uid: 'seed-admin',
          email: (process.env.ADMIN_EMAIL || 'babakunju900@gmail.com').toLowerCase(),
          username: 'Super Admin',
          phone: '+91 98765 00001',
          role: 'admin',
          status: 'active',
          subscriptionTier: 'yearly',
          preferredLanguages: ['English', 'Hindi', 'Malayalam'],
        },
        {
          uid: 'seed-member-1',
          email: 'priya.sharma@example.com',
          username: 'Priya Sharma',
          phone: '+91 98201 44510',
          role: 'user',
          status: 'active',
          subscriptionTier: 'monthly',
          preferredLanguages: ['Hindi', 'English'],
        },
        {
          uid: 'seed-member-2',
          email: 'arjun.menon@example.com',
          username: 'Arjun Menon',
          phone: '+91 98470 22918',
          role: 'broadcaster',
          status: 'active',
          subscriptionTier: 'yearly',
          preferredLanguages: ['Malayalam', 'Tamil', 'English'],
        },
      ]).onConflictDoNothing();

      await db.insert(transactions).values([
        {
          userUid: 'seed-member-1',
          userEmail: 'priya.sharma@example.com',
          planCode: 'monthly',
          amount: 299,
          currency: 'INR',
          paymentMethod: 'upi',
          referenceId: 'UTR432891004512',
          status: 'verified',
          adminNote: 'Verified via UPI settlement batch.',
          verifiedAt: new Date(),
        },
        {
          userUid: 'seed-member-2',
          userEmail: 'arjun.menon@example.com',
          planCode: 'yearly',
          amount: 2499,
          currency: 'INR',
          paymentMethod: 'qr',
          referenceId: 'UTR432998712301',
          status: 'pending_verification',
          adminNote: 'Awaiting UTR reconciliation.',
        },
      ]);

      await db.insert(notifications).values([
        {
          title: 'Now Streaming: Rain Over Kobe (4K HDR)',
          body: 'Our flagship neo-noir thriller is now live with Dolby Atmos audio.',
          type: 'new_movie',
          targetAudience: 'all',
        },
        {
          title: 'LIVE NOW: The Glass House 24/7 Multi-Cam',
          body: 'Eviction nominations are heating up across Living Room and Garden cameras.',
          type: 'live_now',
          targetAudience: 'all',
        },
      ]);

      await db.insert(copyrightReports).values([
        {
          titleId: insertedTitles[0]?.id ?? null,
          titleName: 'Sample External Clip Audit',
          reporterName: 'Rights Verification Desk',
          reporterEmail: 'rights@kinostage.media',
          claimType: 'Territory Rights Audit',
          details: 'Routine quarterly audit confirming global streaming distribution clearance.',
          status: 'dismissed',
        },
      ]);

      await db.insert(adminActivityLogs).values([
        {
          adminEmail: (process.env.ADMIN_EMAIL || 'babakunju900@gmail.com').toLowerCase(),
          action: 'PLATFORM_BOOTSTRAP',
          targetType: 'system',
          targetId: 'catalog',
          details: 'Initialized KinoStage PostgreSQL catalog, 9-camera Reality House, and Live TV lineup.',
        },
      ]);

      seeded = true;
    } catch (error) {
      seedPromise = null;
      console.error('Database seeding failed:', error);
      throw new Error('Failed to initialize platform catalog.', { cause: error });
    }
  })();

  return seedPromise;
}
