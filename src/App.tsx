/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Bell, Bookmark, Film, Home, Radio, Shield, Tv, User, X } from 'lucide-react';
import { auth } from './lib/firebase';
import { apiFetch, getAuthToken, setAuthToken } from './lib/api';
import type {
  EpisodeItem,
  LiveChannelItem,
  LiveEventItem,
  NotificationItem,
  RealityEpisode,
  RealityShowItem,
  SubscriptionPlanItem,
  TitleItem,
  UserProfile,
} from './types/ott';
import { BrandLogo, SplashScreen } from './components/BrandLogo';
import { HomeView } from './components/HomeView';
import { CatalogBrowseView } from './components/CatalogBrowseView';
import { TitleDetailView } from './components/TitleDetailView';
import { RealityShowView } from './components/RealityShowView';
import { LiveTvStudioView } from './components/LiveTvStudioView';
import { ProfileSubscriptionView } from './components/ProfileSubscriptionView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { VideoPlayerModal, type PlayerMedia } from './components/VideoPlayerModal';

type NavTab = 'home' | 'movies' | 'series' | 'live' | 'reality' | 'mylist' | 'profile' | 'admin';

interface CatalogResponse {
  titles: TitleItem[];
  plans: SubscriptionPlanItem[];
  notifications: NotificationItem[];
  liveEvents: LiveEventItem[];
  liveChannels: LiveChannelItem[];
  realityShows: RealityShowItem[];
  paymentConfig: Record<string, unknown>;
  watchlistIds: number[];
  watchHistory: Array<{
    titleId: number;
    episodeId: number | null;
    progressSeconds: number;
    durationSeconds: number;
    completed: boolean;
    updatedAt: string;
  }>;
  recommendations: {
    continueWatching: Array<TitleItem & { progressSeconds: number; durationSeconds: number; progressPct: number }>;
    recommendedForYou: TitleItem[];
    becauseYouWatched: { anchorTitle: string; items: TitleItem[] } | null;
    popularInYourLanguage: { language: string; items: TitleItem[] };
  };
}

export default function App() {
  const skipSplash =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [showSplash, setShowSplash] = useState(!skipSplash);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [selectedTitleId, setSelectedTitleId] = useState<number | null>(null);
  const [selectedLiveChannelId, setSelectedLiveChannelId] = useState<number | null>(null);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [adminBootstrap, setAdminBootstrap] = useState({ needsSetup: false, envConfigured: false });
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localWatchlist, setLocalWatchlist] = useState<number[]>([]);
  const [liveToast, setLiveToast] = useState<NotificationItem | null>(null);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);

  // Active cinema player state
  const [activePlayer, setActivePlayer] = useState<PlayerMedia | null>(null);
  const [episodeQueue, setEpisodeQueue] = useState<{ title: TitleItem; episodes: EpisodeItem[]; index: number } | null>(
    null
  );

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await apiFetch<CatalogResponse>('/api/catalog');
      setCatalog(res);
      setLoadError(null);
      if (getAuthToken()) {
        setLocalWatchlist(res.watchlistIds);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to connect to KinoStage catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  const syncSession = useCallback(async () => {
    try {
      const me = await apiFetch<{
        authenticated: boolean;
        user: UserProfile | null;
        adminBootstrap: { needsSetup: boolean; envConfigured: boolean };
      }>('/api/auth/me');
      setUser(me.user);
      setAdminBootstrap(me.adminBootstrap);
    } catch {
      // Non-fatal
    }
  }, []);

  // Listen to Firebase Auth state & sync catalog
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          setAuthToken(token);
        } catch {
          // Ignore
        }
      }
      await Promise.all([syncSession(), fetchCatalog()]);
    });
    return () => unsub();
  }, [syncSession, fetchCatalog]);

  // Global WebSocket listener for live push notifications
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification:push' && data.notification) {
          setLiveToast(data.notification);
          setCatalog((prev) =>
            prev ? { ...prev, notifications: [data.notification, ...prev.notifications] } : prev
          );
          window.setTimeout(() => setLiveToast(null), 6500);
        }
      } catch {
        // Ignore
      }
    };
    return () => ws.close();
  }, []);

  function navigateTo(tab: string) {
    setSelectedTitleId(null);
    setActiveTab(tab as NavTab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleToggleWatchlist(titleId: number) {
    if (!user) {
      // Optimistic guest list in memory so browsing stays responsive
      setLocalWatchlist((prev) =>
        prev.includes(titleId) ? prev.filter((id) => id !== titleId) : [...prev, titleId]
      );
      return;
    }

    setLocalWatchlist((prev) =>
      prev.includes(titleId) ? prev.filter((id) => id !== titleId) : [...prev, titleId]
    );
    try {
      const res = await apiFetch<{ inWatchlist: boolean }>('/api/watchlist/toggle', {
        method: 'POST',
        body: JSON.stringify({ titleId }),
      });
      setLocalWatchlist((prev) =>
        res.inWatchlist ? Array.from(new Set([...prev, titleId])) : prev.filter((id) => id !== titleId)
      );
      fetchCatalog();
    } catch {
      fetchCatalog();
    }
  }

  function handlePlayTitle(title: TitleItem, episode?: EpisodeItem, seasonEpisodes?: EpisodeItem[]) {
    apiFetch(`/api/titles/${title.id}/view`, { method: 'POST' }).catch(() => {});

    const historyEntry = catalog?.watchHistory.find((h) => h.titleId === title.id);

    if (episode && seasonEpisodes) {
      const idx = seasonEpisodes.findIndex((e) => e.id === episode.id);
      const nextEp = idx >= 0 && idx < seasonEpisodes.length - 1 ? seasonEpisodes[idx + 1] : null;
      setEpisodeQueue({ title, episodes: seasonEpisodes, index: idx });
      setActivePlayer({
        titleId: title.id,
        episodeId: episode.id,
        title: `${title.title} — Ep ${episode.episodeNumber}: ${episode.title}`,
        subtitle: `${title.language} · ${episode.durationMinutes} min`,
        sourceType: episode.videoSourceType,
        videoUrl: episode.videoUrl,
        posterUrl: episode.posterUrl,
        initialProgressSeconds: historyEntry?.episodeId === episode.id ? historyEntry.progressSeconds : 0,
        hasNextEpisode: Boolean(nextEp),
        nextEpisodeTitle: nextEp ? `Ep ${nextEp.episodeNumber}: ${nextEp.title}` : undefined,
      });
      return;
    }

    setEpisodeQueue(null);
    setActivePlayer({
      titleId: title.id,
      title: title.title,
      subtitle: `${title.releaseYear} · ${title.language} · ${title.genres.join(', ')}`,
      sourceType: title.videoSourceType,
      videoUrl: title.videoUrl,
      youtubeVideoId: title.youtubeVideoId,
      posterUrl: title.backdropUrl,
      initialProgressSeconds: historyEntry?.progressSeconds || 0,
    });
  }

  function handlePlayTrailer(title: TitleItem) {
    if (!title.trailerYoutubeId) return;
    setEpisodeQueue(null);
    setActivePlayer({
      title: `${title.title} — Official Trailer`,
      subtitle: 'Official YouTube Embedded Player',
      sourceType: 'youtube',
      videoUrl: `https://www.youtube.com/watch?v=${title.trailerYoutubeId}`,
      youtubeVideoId: title.trailerYoutubeId,
      posterUrl: title.backdropUrl,
    });
  }

  function handlePlayNextEpisode() {
    if (!episodeQueue) return;
    const nextIdx = episodeQueue.index + 1;
    if (nextIdx < episodeQueue.episodes.length) {
      handlePlayTitle(episodeQueue.title, episodeQueue.episodes[nextIdx], episodeQueue.episodes);
    }
  }

  async function handleSaveProgress(progressSeconds: number, durationSeconds: number, completed: boolean) {
    if (!user || !activePlayer?.titleId) return;
    try {
      await apiFetch('/api/watch-history', {
        method: 'POST',
        body: JSON.stringify({
          titleId: activePlayer.titleId,
          episodeId: activePlayer.episodeId ?? null,
          progressSeconds,
          durationSeconds,
          completed,
        }),
      });
      fetchCatalog();
    } catch {
      // Non-fatal
    }
  }

  function handlePlayRealityEpisode(ep: RealityEpisode, showName: string) {
    setEpisodeQueue(null);
    setActivePlayer({
      title: `${showName} — ${ep.title}`,
      subtitle: `${ep.kind.toUpperCase()} · ${ep.airDate}`,
      sourceType: ep.videoSourceType,
      videoUrl: ep.videoUrl,
      posterUrl: ep.thumbnailUrl,
    });
  }

  function handlePlayEvent(ev: LiveEventItem) {
    setEpisodeQueue(null);
    setActivePlayer({
      title: ev.title,
      subtitle: `${ev.category} · ${ev.startsAt}`,
      sourceType: ev.streamType === 'youtube' ? 'youtube' : 'hls',
      videoUrl: ev.streamUrl,
      posterUrl: ev.bannerUrl,
      isLive: ev.status === 'live',
    });
  }

  async function handleRsvpEvent(eventId: number) {
    try {
      const res = await apiFetch<{ event: LiveEventItem }>(`/api/live/events/${eventId}/rsvp`, {
        method: 'POST',
      });
      setCatalog((prev) =>
        prev
          ? {
              ...prev,
              liveEvents: prev.liveEvents.map((e) => (e.id === eventId ? res.event : e)),
            }
          : prev
      );
    } catch {
      // Ignore
    }
  }

  const desktopNav: Array<{ id: NavTab; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'movies', label: 'Movies' },
    { id: 'series', label: 'Series' },
    { id: 'live', label: 'Live' },
    { id: 'reality', label: 'Reality Shows' },
    { id: 'mylist', label: 'My List' },
  ];

  const mobileNav: Array<{ id: NavTab; label: string; icon: typeof Home }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'movies', label: 'Movies', icon: Film },
    { id: 'live', label: 'Live', icon: Tv },
    { id: 'reality', label: 'Reality', icon: Radio },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#070709] text-[#F4F4F5] flex flex-col">
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Top Navigation Bar — Clean 3-Zone Contract */}
      <header className="sticky top-0 z-40 h-14 md:h-16 bg-[#070709]/90 backdrop-blur-md border-b border-white/[0.07]">
        <div className="max-w-[1440px] h-full mx-auto px-5 sm:px-8 lg:px-12 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => navigateTo('home')}
            aria-label="KinoStage Home"
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] rounded-lg cursor-pointer"
          >
            <BrandLogo />
          </button>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Primary navigation">
            {desktopNav.map((item) => {
              const isActive = activeTab === item.id && selectedTitleId === null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                  className={`relative py-1 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute -bottom-[21px] left-0 right-0 h-[2px] bg-[#E50914]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Account / Profile Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowNotifDrawer((s) => !s)}
              aria-label="Notifications"
              className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigateTo('profile')}
              className="inline-flex items-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white text-xs font-semibold px-4 py-2.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              {user ? user.username.split(' ')[0] : 'Profile'}
            </button>
          </div>
        </div>
      </header>

      {/* Notifications Popover */}
      {showNotifDrawer && catalog && (
        <div className="fixed top-18 right-5 z-40 w-80 max-w-[90vw] rounded-2xl bg-[#121319] border border-white/15 shadow-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-white">Broadcast &amp; Release Alerts</h2>
            <button
              type="button"
              onClick={() => setShowNotifDrawer(false)}
              aria-label="Close notifications"
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-white/[0.06] max-h-72 overflow-y-auto">
            {catalog.notifications.map((n) => (
              <div key={n.id} className="py-2.5 space-y-0.5">
                <p className="text-xs font-semibold text-white">{n.title}</p>
                <p className="text-[11px] text-zinc-400">{n.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real-Time Push Toast */}
      {liveToast && (
        <div className="fixed bottom-20 md:bottom-6 right-5 z-50 max-w-sm rounded-xl bg-[#16171d] border border-[#E50914]/50 p-4 shadow-2xl flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#E50914] uppercase">Live Alert</p>
            <p className="text-sm font-semibold text-white mt-0.5">{liveToast.title}</p>
            <p className="text-xs text-zinc-300 mt-0.5">{liveToast.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            aria-label="Dismiss alert"
            className="text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 pb-16 md:pb-0">
        {loading ? (
          <div className="max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12 py-10 space-y-8 animate-pulse">
            <div className="h-[460px] rounded-2xl bg-[#111218]" />
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] rounded-xl bg-[#111218]" />
              ))}
            </div>
          </div>
        ) : loadError || !catalog ? (
          <div className="max-w-lg mx-auto px-6 py-24 text-center space-y-4">
            <h1 className="font-display text-2xl font-bold text-white">Unable to Load Catalog</h1>
            <p className="text-sm text-zinc-400">{loadError || 'The streaming service is temporarily unavailable.'}</p>
            <button
              type="button"
              onClick={fetchCatalog}
              className="rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white text-sm font-semibold px-6 py-3 cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        ) : selectedTitleId !== null ? (
          <TitleDetailView
            titleId={selectedTitleId}
            user={user}
            watchlistIds={localWatchlist}
            onBack={() => setSelectedTitleId(null)}
            onPlayTitle={handlePlayTitle}
            onPlayTrailer={handlePlayTrailer}
            onToggleWatchlist={handleToggleWatchlist}
            onSelectTitle={(t) => setSelectedTitleId(t.id)}
            onRequireAuth={() => navigateTo('profile')}
          />
        ) : activeTab === 'home' ? (
          <HomeView
            titles={catalog.titles}
            liveChannels={catalog.liveChannels}
            liveEvents={catalog.liveEvents}
            realityShows={catalog.realityShows}
            watchlistIds={localWatchlist}
            recommendations={catalog.recommendations}
            onSelectTitle={(t) => setSelectedTitleId(t.id)}
            onPlayTitle={(t) => handlePlayTitle(t)}
            onToggleWatchlist={handleToggleWatchlist}
            onOpenLiveChannel={(ch) => {
              setSelectedLiveChannelId(ch.id);
              navigateTo('live');
            }}
            onOpenRealityShow={() => navigateTo('reality')}
            onRsvpEvent={handleRsvpEvent}
            onNavigate={navigateTo}
          />
        ) : activeTab === 'movies' || activeTab === 'series' || activeTab === 'mylist' ? (
          <CatalogBrowseView
            mode={activeTab}
            titles={catalog.titles}
            watchlistIds={localWatchlist}
            onSelectTitle={(t) => setSelectedTitleId(t.id)}
            onPlayTitle={(t) => handlePlayTitle(t)}
            onToggleWatchlist={handleToggleWatchlist}
            onBrowseAll={() => navigateTo('home')}
          />
        ) : activeTab === 'reality' ? (
          <RealityShowView user={user} onPlayEpisode={handlePlayRealityEpisode} />
        ) : activeTab === 'live' ? (
          <LiveTvStudioView
            user={user}
            initialChannelId={selectedLiveChannelId}
            onRequireAuth={() => navigateTo('profile')}
            onPlayEvent={handlePlayEvent}
          />
        ) : activeTab === 'profile' ? (
          <ProfileSubscriptionView
            user={user}
            plans={catalog.plans}
            paymentConfig={catalog.paymentConfig}
            titles={catalog.titles}
            watchHistory={catalog.watchHistory}
            onAuthChange={(nextUser) => {
              setUser(nextUser);
              fetchCatalog();
            }}
            onSelectTitle={(t) => setSelectedTitleId(t.id)}
            onOpenAdmin={() => navigateTo('admin')}
          />
        ) : (
          <AdminDashboardView
            user={user}
            adminBootstrap={adminBootstrap}
            onAuthChange={(nextUser) => {
              setUser(nextUser);
              syncSession();
              fetchCatalog();
            }}
            onCatalogUpdated={fetchCatalog}
          />
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="hidden md:block border-t border-white/[0.07] bg-[#070709] py-8">
        <div className="max-w-[1440px] mx-auto px-8 lg:px-12 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-4">
            <BrandLogo size="sm" />
            <span>© {new Date().getFullYear()} KinoStage Digital Entertainment. Licensed OTT &amp; Live Broadcast Platform.</span>
          </div>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => navigateTo('mylist')} className="hover:text-zinc-200 cursor-pointer inline-flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5" />
              My List
            </button>
            <button type="button" onClick={() => navigateTo('profile')} className="hover:text-zinc-200 cursor-pointer">
              Plans &amp; Legal
            </button>
            <button type="button" onClick={() => navigateTo('admin')} className="hover:text-zinc-200 cursor-pointer inline-flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
              Super Admin
            </button>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (<= 60px, compliant with 15% sticky cap) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-15 bg-[#0a0b0f]/95 backdrop-blur-md border-t border-white/10 grid grid-cols-5 items-center"
      >
        {mobileNav.map((item) => {
          const isActive = activeTab === item.id && selectedTitleId === null;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateTo(item.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 cursor-pointer ${
                isActive ? 'text-[#E50914]' : 'text-zinc-400'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Fullscreen Cinema Video Player Modal */}
      {activePlayer && (
        <VideoPlayerModal
          media={activePlayer}
          onClose={() => setActivePlayer(null)}
          onSaveProgress={handleSaveProgress}
          onNextEpisode={episodeQueue ? handlePlayNextEpisode : undefined}
        />
      )}
    </div>
  );
}
