import { Play, Plus, Check, Info, Radio, Calendar, Tv, Sparkles } from 'lucide-react';
import type { LiveChannelItem, LiveEventItem, RealityShowItem, TitleItem } from '../types/ott';
import { formatMinutes } from '../utils/ott';
import { MediaImage } from './MediaImage';
import { TitleCard } from './TitleCard';

interface HomeViewProps {
  titles: TitleItem[];
  liveChannels: LiveChannelItem[];
  liveEvents: LiveEventItem[];
  realityShows: RealityShowItem[];
  watchlistIds: number[];
  recommendations: {
    continueWatching: Array<TitleItem & { progressSeconds: number; durationSeconds: number; progressPct: number }>;
    recommendedForYou: TitleItem[];
    becauseYouWatched: { anchorTitle: string; items: TitleItem[] } | null;
    popularInYourLanguage: { language: string; items: TitleItem[] };
  };
  onSelectTitle: (title: TitleItem) => void;
  onPlayTitle: (title: TitleItem) => void;
  onToggleWatchlist: (titleId: number) => void;
  onOpenLiveChannel: (channel: LiveChannelItem) => void;
  onOpenRealityShow: (showId?: number) => void;
  onRsvpEvent: (eventId: number) => void;
  onNavigate: (tab: string) => void;
}

export function HomeView({
  titles,
  liveChannels,
  liveEvents,
  realityShows,
  watchlistIds,
  recommendations,
  onSelectTitle,
  onPlayTitle,
  onToggleWatchlist,
  onOpenLiveChannel,
  onOpenRealityShow,
  onRsvpEvent,
  onNavigate,
}: HomeViewProps) {
  const featured = titles.find((t) => t.isFeatured) || titles[0];
  const movies = titles.filter((t) => t.type === 'movie');
  const series = titles.filter((t) => t.type === 'series');
  const trendingMovies = movies.filter((t) => t.isTrending);
  const top10Movies = [...titles]
    .filter((t) => typeof t.top10Rank === 'number')
    .sort((a, b) => (a.top10Rank || 99) - (b.top10Rank || 99))
    .slice(0, 10);
  const latestReleases = titles.filter((t) => t.isLatest);
  const recentlyAdded = [...titles].slice(0, 8);
  const liveNowChannels = liveChannels.filter((c) => c.status === 'live');
  const inWatchlistSet = new Set(watchlistIds);

  return (
    <div className="space-y-12 pb-16">
      {/* Featured Cinema Hero Banner */}
      {featured && (
        <section className="relative w-full min-h-[540px] lg:min-h-[620px] flex items-end overflow-hidden border-b border-white/[0.06]">
          <MediaImage
            src={featured.backdropUrl}
            alt={featured.title}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070709] via-[#070709]/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070709] via-[#070709]/35 to-black/30" />

          <div className="relative z-10 w-full max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12 pb-12 pt-28">
            <div className="max-w-2xl space-y-4">
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-[#D4AF37]">
                Featured Premiere · {featured.category}
              </p>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white [text-wrap:balance]">
                {featured.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300 tabular-nums">
                <span className="font-semibold text-[#D4AF37]">{featured.rating.toFixed(1)} IMDb</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>{featured.releaseYear}</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>{formatMinutes(featured.durationMinutes)}</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>{featured.language}</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>{featured.ageRating}</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>{featured.genres.join(', ')}</span>
              </div>
              <p className="text-[15px] leading-relaxed text-zinc-300 max-w-xl line-clamp-3">
                {featured.description}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onPlayTitle(featured)}
                  className="inline-flex items-center gap-2.5 rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold text-sm px-6 py-3.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Watch Now
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTitle(featured)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-sm px-5 py-3.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Info className="w-4 h-4" />
                  More Details
                </button>
                <button
                  type="button"
                  onClick={() => onToggleWatchlist(featured.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-black/50 hover:bg-black/75 border border-white/15 text-zinc-100 font-medium text-sm px-5 py-3.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {inWatchlistSet.has(featured.id) ? (
                    <>
                      <Check className="w-4 h-4 text-[#D4AF37]" />
                      In My List
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      My List
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12 space-y-12">
        {/* Continue Watching */}
        {recommendations.continueWatching.length > 0 && (
          <ShelfSection title="Continue Watching" subtitle="Resume right where you paused">
            {recommendations.continueWatching.map((item) => (
              <TitleCard
                key={`cw-${item.id}`}
                title={item}
                progressPct={item.progressPct}
                inWatchlist={inWatchlistSet.has(item.id)}
                onSelect={onSelectTitle}
                onPlay={onPlayTitle}
                onToggleWatchlist={onToggleWatchlist}
              />
            ))}
          </ShelfSection>
        )}

        {/* 24/7 Reality Shows Spotlight */}
        {realityShows.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-wrap sm:flex-nowrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-white leading-snug">
                  Reality Shows · 24/7 Multi-Camera House
                </h2>
                <p className="text-xs text-zinc-400 mt-1">Switch live across 9 studio cameras, vote in evictions, and join live polls</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenRealityShow(realityShows[0].id)}
                className="text-sm font-medium text-zinc-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                Enter Live House
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {realityShows.map((show) => (
                <div
                  key={show.id}
                  className="lg:col-span-12 relative overflow-hidden rounded-2xl border border-white/10 bg-[#111218] grid grid-cols-1 lg:grid-cols-12 items-stretch"
                >
                  <div className="lg:col-span-7 relative min-h-[260px]">
                    <MediaImage
                      src={show.coverUrl}
                      alt={show.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/20 to-[#111218] hidden lg:block" />
                    <div className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-md bg-black/80 px-3 py-1.5 text-xs font-semibold text-white">
                      <span className="w-2 h-2 rounded-full bg-[#E50914] animate-pulse" />
                      LIVE 24/7 · {show.viewerCount.toLocaleString()} watching
                    </div>
                  </div>
                  <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between gap-5">
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-[#D4AF37]">{show.episodeSchedule}</p>
                      <h3 className="font-display text-2xl sm:text-3xl font-bold text-white">{show.name}</h3>
                      <p className="text-sm text-zinc-300 leading-relaxed">{show.description}</p>
                      <p className="text-xs text-zinc-400">
                        Main Camera · Living Room · Garden · Kitchen · Bedroom · 4 Studio Cams
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenRealityShow(show.id)}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold text-sm px-5 py-3 transition-colors cursor-pointer"
                      >
                        <Radio className="w-4 h-4" />
                        Watch Multi-Cam Live
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Trending Movies */}
        <ShelfSection
          title="Trending Movies"
          actionLabel="All Movies"
          onAction={() => onNavigate('movies')}
        >
          {(trendingMovies.length > 0 ? trendingMovies : movies).map((item) => (
            <TitleCard
              key={`tr-${item.id}`}
              title={item}
              inWatchlist={inWatchlistSet.has(item.id)}
              onSelect={onSelectTitle}
              onPlay={onPlayTitle}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </ShelfSection>

        {/* Top 10 Movies */}
        <ShelfSection title="Top 10 on KinoStage" subtitle="Most-watched cinema & originals this week">
          {top10Movies.map((item, idx) => (
            <TitleCard
              key={`top-${item.id}`}
              title={item}
              rank={item.top10Rank || idx + 1}
              inWatchlist={inWatchlistSet.has(item.id)}
              onSelect={onSelectTitle}
              onPlay={onPlayTitle}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </ShelfSection>

        {/* Live Now (Live TV Channels) */}
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Live Now</h2>
              <p className="text-xs text-zinc-400 mt-1">24/7 broadcast TV channels & live feeds</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('live')}
              className="text-sm font-medium text-zinc-300 hover:text-white whitespace-nowrap cursor-pointer"
            >
              Open Live TV Guide
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {liveNowChannels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => onOpenLiveChannel(ch)}
                className="group text-left rounded-xl overflow-hidden bg-[#121319] border border-white/[0.07] hover:border-white/20 transition-colors cursor-pointer"
              >
                <div className="relative aspect-video overflow-hidden">
                  <MediaImage
                    src={ch.bannerUrl}
                    alt={ch.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-black/80 px-2.5 py-1 rounded text-[11px] font-semibold text-white">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E50914] animate-pulse" />
                    LIVE
                  </span>
                  <span className="absolute bottom-2.5 right-3 text-[11px] font-mono text-zinc-300 tabular-nums">
                    {ch.viewerCount.toLocaleString()} viewers
                  </span>
                </div>
                <div className="p-3.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold text-white truncate">{ch.name}</span>
                    <Tv className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  </div>
                  <p className="text-xs text-zinc-300 truncate">{ch.currentProgram}</p>
                  <p className="text-[11px] text-zinc-500">
                    {ch.category} · {ch.language}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Popular Web Series */}
        <ShelfSection
          title="Popular Web Series"
          actionLabel="All Series"
          onAction={() => onNavigate('series')}
        >
          {series.map((item) => (
            <TitleCard
              key={`ser-${item.id}`}
              title={item}
              inWatchlist={inWatchlistSet.has(item.id)}
              onSelect={onSelectTitle}
              onPlay={onPlayTitle}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </ShelfSection>

        {/* Latest Releases */}
        <ShelfSection title="Latest Releases">
          {latestReleases.map((item) => (
            <TitleCard
              key={`lat-${item.id}`}
              title={item}
              inWatchlist={inWatchlistSet.has(item.id)}
              onSelect={onSelectTitle}
              onPlay={onPlayTitle}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </ShelfSection>

        {/* Upcoming Events & Live Premieres */}
        {liveEvents.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Live Events &amp; Premieres</h2>
                <p className="text-xs text-zinc-400 mt-1">Exclusive red-carpet premieres, concerts, and live specials</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('live')}
                className="text-sm font-medium text-zinc-300 hover:text-white whitespace-nowrap cursor-pointer"
              >
                View Schedule
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {liveEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-xl overflow-hidden bg-[#121319] border border-white/[0.07] flex flex-col"
                >
                  <div className="relative aspect-video">
                    <MediaImage src={ev.bannerUrl} alt={ev.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <span className="absolute bottom-3 left-3 text-xs font-medium text-[#D4AF37]">
                      {ev.startsAt}
                    </span>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <p className="text-[11px] uppercase tracking-wider text-zinc-400">
                        {ev.category} · {ev.status === 'live' ? 'Live Now' : 'Upcoming'}
                      </p>
                      <h3 className="font-display text-base font-semibold text-white leading-snug">{ev.title}</h3>
                      <p className="text-xs text-zinc-400 line-clamp-2">{ev.description}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
                      <span className="text-xs font-mono text-zinc-400 tabular-nums">
                        {ev.rsvpCount.toLocaleString()} interested
                      </span>
                      <button
                        type="button"
                        onClick={() => onRsvpEvent(ev.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white px-3 py-2 transition-colors cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Remind Me
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Personalized Recommendations */}
        {recommendations.becauseYouWatched && (
          <ShelfSection
            title={`Because You Watched ${recommendations.becauseYouWatched.anchorTitle}`}
          >
            {recommendations.becauseYouWatched.items.map((item) => (
              <TitleCard
                key={`byw-${item.id}`}
                title={item}
                inWatchlist={inWatchlistSet.has(item.id)}
                onSelect={onSelectTitle}
                onPlay={onPlayTitle}
                onToggleWatchlist={onToggleWatchlist}
              />
            ))}
          </ShelfSection>
        )}

        <ShelfSection
          title="Recommended For You"
          subtitle={`Tailored to your viewing history · Popular in ${recommendations.popularInYourLanguage.language}`}
        >
          {recommendations.recommendedForYou.slice(0, 8).map((item) => (
            <TitleCard
              key={`rec-${item.id}`}
              title={item}
              inWatchlist={inWatchlistSet.has(item.id)}
              onSelect={onSelectTitle}
              onPlay={onPlayTitle}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </ShelfSection>

        {/* Recently Added */}
        <ShelfSection title="Recently Added">
          {recentlyAdded.map((item) => (
            <TitleCard
              key={`new-${item.id}`}
              title={item}
              inWatchlist={inWatchlistSet.has(item.id)}
              onSelect={onSelectTitle}
              onPlay={onPlayTitle}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </ShelfSection>

        {/* Subtle Editorial CTA for Subscriptions */}
        <section className="rounded-2xl bg-[#121319] border border-white/[0.08] p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D4AF37] inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              KinoStage VIP Membership
            </p>
            <h2 className="font-display text-2xl font-bold text-white">
              Unlock 4K HDR Cinema, All 9 Reality Cameras &amp; Exclusive Live Premieres
            </h2>
            <p className="text-sm text-zinc-400">
              Flexible Free, Monthly, and Annual plans with verified UPI, QR, and card billing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold text-sm px-6 py-3.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Explore Plans
          </button>
        </section>
      </div>
    </div>
  );
}

function ShelfSection({
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>}
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="text-sm font-medium text-zinc-300 hover:text-white whitespace-nowrap cursor-pointer"
          >
            {actionLabel}
          </button>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">{children}</div>
    </section>
  );
}
