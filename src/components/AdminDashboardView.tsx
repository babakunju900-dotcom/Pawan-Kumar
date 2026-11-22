import { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Camera,
  CheckCircle2,
  CreditCard,
  Film,
  KeyRound,
  LayoutDashboard,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Tv,
  Users,
  Youtube,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api';
import type {
  LiveChannelItem,
  NotificationItem,
  RealityShowItem,
  TitleItem,
  TransactionItem,
  UserProfile,
} from '../types/ott';
import { MediaImage } from './MediaImage';

interface AdminOverviewData {
  kpis: {
    totalUsers: number;
    activeUsers: number;
    premiumSubscribers: number;
    totalMovies: number;
    totalSeries: number;
    activeLiveStreams: number;
    totalViews: number;
    watchTimeMinutes: number;
    subscriptionRevenue: number;
  };
  users: UserProfile[];
  titles: TitleItem[];
  channels: LiveChannelItem[];
  realityShows: RealityShowItem[];
  transactions: TransactionItem[];
  youtubeImports: Array<{
    id: number;
    youtubeVideoId: string;
    youtubeUrl: string;
    fetchedTitle: string;
    status: string;
    errorMessage: string;
    createdAt: string;
  }>;
  notifications: NotificationItem[];
  copyrightReports: Array<{
    id: number;
    titleId: number | null;
    titleName: string;
    reporterName: string;
    reporterEmail: string;
    claimType: string;
    details: string;
    status: string;
    createdAt: string;
  }>;
  activityLogs: Array<{
    id: number;
    adminEmail: string;
    action: string;
    targetType: string;
    details: string;
    createdAt: string;
  }>;
  settings: Record<string, Record<string, unknown>>;
}

interface SetupStatus {
  cloudSql: boolean;
  firebaseAuth: boolean;
  geminiAi: boolean;
  youtubeDataApi: boolean;
  tmdbApi: boolean;
  paymentGateway: boolean;
  adminPasscodeEnv: boolean;
}

interface AdminDashboardViewProps {
  user: UserProfile | null;
  adminBootstrap: { needsSetup: boolean; envConfigured: boolean };
  onAuthChange: (user: UserProfile, token: string) => void;
  onCatalogUpdated: () => void;
}

type AdminSection =
  | 'overview'
  | 'youtube'
  | 'content'
  | 'live'
  | 'users'
  | 'finance'
  | 'notifications'
  | 'ai'
  | 'compliance';

export function AdminDashboardView({
  user,
  adminBootstrap,
  onAuthChange,
  onCatalogUpdated,
}: AdminDashboardViewProps) {
  const [section, setSection] = useState<AdminSection>('overview');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // Admin Gate form
  const [gatePasscode, setGatePasscode] = useState('');
  const [gateEmail, setGateEmail] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);

  // YouTube Auto Import state
  const [ytUrl, setYtUrl] = useState('');
  const [ytFetching, setYtFetching] = useState(false);
  const [ytPreview, setYtPreview] = useState<{
    importId: number;
    youtubeVideoId: string;
    youtubeUrl: string;
    isDuplicate: boolean;
    duplicateTitleName: string | null;
    metadataSource: string;
    complianceNotice: string;
    preview: {
      title: string;
      description: string;
      posterUrl: string;
      backdropUrl: string;
      releaseYear: number;
      durationMinutes: number;
      language: string;
      genres: string[];
      castList: string[];
      director: string;
      rating: number;
      category: string;
      tags: string[];
      rightsOwner: string;
    };
  } | null>(null);

  // Manual Content Creation
  const [newTitle, setNewTitle] = useState({
    type: 'movie' as 'movie' | 'series',
    title: '',
    description: '',
    videoSourceType: 'hls' as 'hls' | 'youtube' | 'dash' | 'direct',
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    posterUrl: '/src/assets/images/poster_midnight_protocol_1795368981364.jpg',
    language: 'English',
    releaseYear: 2026,
    durationMinutes: 118,
    genres: 'Thriller, Action',
    director: '',
    category: 'Feature Film',
    isPremium: false,
  });

  // Live Channel Creation
  const [newChannel, setNewChannel] = useState({
    name: '',
    category: 'Movies',
    language: 'English',
    streamType: 'hls' as 'hls' | 'youtube' | 'rtmp',
    hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    youtubeEmbedId: '',
    currentProgram: '24/7 Live Stream',
  });

  // Rotated camera stream key (displayed once)
  const [rotatedCamKey, setRotatedCamKey] = useState<{ camName: string; key: string } | null>(null);

  // UPI Settings
  const [upiId, setUpiId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [qrNote, setQrNote] = useState('');

  // Push Notification
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [notifType, setNotifType] = useState('new_movie');

  // AI Assistant
  const [aiTask, setAiTask] = useState<
    | 'suggest_categories'
    | 'generate_description'
    | 'recommend_posters'
    | 'detect_duplicates'
    | 'suggest_featured'
    | 'generate_tags'
    | 'analyze_trends'
    | 'weekly_report'
  >('weekly_report');
  const [aiTitleInput, setAiTitleInput] = useState('');
  const [aiNotesInput, setAiNotesInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState<{
    headline: string;
    summary: string;
    suggestedItems: string[];
    reviewChecklist: string[];
  } | null>(null);

  const isAdmin = user?.role === 'admin';

  async function loadAdminData() {
    setLoading(true);
    setError(null);
    try {
      const [overview, setup] = await Promise.all([
        apiFetch<AdminOverviewData>('/api/admin/overview'),
        apiFetch<SetupStatus>('/api/setup/status'),
      ]);
      setData(overview);
      setSetupStatus(setup);
      const pay = overview.settings?.payment_config || {};
      setUpiId(String(pay.upiId || 'kinostage.ott@okhdfcbank'));
      setMerchantName(String(pay.merchantName || 'KinoStage Digital Cinema Pvt Ltd'));
      setQrNote(String(pay.qrNote || 'KinoStage Premium Verification'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin console.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    }
  }, [isAdmin]);

  async function handleAdminGateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGateError(null);
    try {
      const endpoint = adminBootstrap.needsSetup ? '/api/auth/admin/claim' : '/api/auth/admin/unlock';
      const res = await apiFetch<{ token: string; user: UserProfile }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          passcode: gatePasscode,
          ...(adminBootstrap.needsSetup && gateEmail ? { email: gateEmail } : {}),
        }),
      });
      setAuthToken(res.token);
      onAuthChange(res.user, res.token);
      setGatePasscode('');
    } catch (err) {
      setGateError(err instanceof Error ? err.message : 'Verification failed.');
    }
  }

  // Gate UI when not logged in as admin
  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-5 py-16">
        <form
          onSubmit={handleAdminGateSubmit}
          className="rounded-2xl bg-[#111218] border border-white/10 p-7 space-y-5"
        >
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D4AF37]">
              Super Admin Access Control
            </p>
            <h1 className="font-display text-2xl font-bold text-white">
              {adminBootstrap.needsSetup ? 'Claim First-Run Super Admin Passcode' : 'Unlock Super Admin Dashboard'}
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {adminBootstrap.needsSetup
                ? 'Set a secure administrator passcode (min 8 characters) to lock and claim the Super Admin dashboard. You can also sign in with your authorized Google Admin account on the Profile page.'
                : 'Enter your Super Admin passcode or sign in with your authorized Google Admin account to manage catalog, live streams, and payments.'}
            </p>
          </div>

          {adminBootstrap.needsSetup && (
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400" htmlFor="admin-email">
                Administrator Email (optional)
              </label>
              <input
                id="admin-email"
                type="email"
                value={gateEmail}
                onChange={(e) => setGateEmail(e.target.value)}
                placeholder="admin@kinostage.media"
                className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-4 py-3 text-sm text-white"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400" htmlFor="admin-pass">
              {adminBootstrap.needsSetup ? 'Create Admin Passcode (min 8 chars)' : 'Super Admin Passcode'}
            </label>
            <input
              id="admin-pass"
              type="password"
              required
              minLength={adminBootstrap.needsSetup ? 8 : 4}
              value={gatePasscode}
              onChange={(e) => setGatePasscode(e.target.value)}
              placeholder="Enter secure passcode"
              className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-4 py-3 text-sm text-white"
            />
          </div>

          {gateError && <p className="text-xs text-red-400">{gateError}</p>}

          <button
            type="submit"
            className="w-full rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold text-sm py-3 cursor-pointer"
          >
            {adminBootstrap.needsSetup ? 'Claim & Enter Super Admin Console' : 'Unlock Super Admin Console'}
          </button>
        </form>
      </div>
    );
  }

  async function handleFetchYouTube(e: React.FormEvent) {
    e.preventDefault();
    setYtFetching(true);
    setBannerMsg(null);
    setError(null);
    try {
      const res = await apiFetch<NonNullable<typeof ytPreview>>('/api/admin/youtube/fetch', {
        method: 'POST',
        body: JSON.stringify({ youtubeUrl: ytUrl }),
      });
      setYtPreview(res);
      loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch YouTube details.');
    } finally {
      setYtFetching(false);
    }
  }

  async function handlePublishYouTube(e: React.FormEvent) {
    e.preventDefault();
    if (!ytPreview) return;
    setError(null);
    try {
      await apiFetch('/api/admin/youtube/publish', {
        method: 'POST',
        body: JSON.stringify({
          importId: ytPreview.importId,
          youtubeVideoId: ytPreview.youtubeVideoId,
          youtubeUrl: ytPreview.youtubeUrl,
          ...ytPreview.preview,
          allowDuplicate: false,
        }),
      });
      setBannerMsg(`Published "${ytPreview.preview.title}" to the live KinoStage homepage!`);
      setYtPreview(null);
      setYtUrl('');
      loadAdminData();
      onCatalogUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish imported movie.');
    }
  }

  async function handleCreateManualTitle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/titles', {
        method: 'POST',
        body: JSON.stringify({
          ...newTitle,
          genres: newTitle.genres.split(',').map((g) => g.trim()).filter(Boolean),
        }),
      });
      setBannerMsg(`Created "${newTitle.title}" in catalog.`);
      setNewTitle((prev) => ({ ...prev, title: '', description: '' }));
      loadAdminData();
      onCatalogUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add title.');
    }
  }

  async function handleAddChannel(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/channels', {
        method: 'POST',
        body: JSON.stringify(newChannel),
      });
      setBannerMsg(`Added Live TV Channel "${newChannel.name}".`);
      setNewChannel((prev) => ({ ...prev, name: '' }));
      loadAdminData();
      onCatalogUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel.');
    }
  }

  async function handleSaveUpi(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/settings/payment', {
        method: 'PUT',
        body: JSON.stringify({ upiId, merchantName, qrNote, gatewayEnabled: Boolean(setupStatus?.paymentGateway) }),
      });
      setBannerMsg('UPI ID, QR merchant settings, and gateway configuration saved.');
      onCatalogUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update payment settings.');
    }
  }

  async function handleSendNotification(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({ title: notifTitle, body: notifBody, type: notifType }),
      });
      setBannerMsg('Live push notification dispatched to all connected viewers.');
      setNotifTitle('');
      setNotifBody('');
      loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send notification.');
    }
  }

  async function handleRunAi(e: React.FormEvent) {
    e.preventDefault();
    setAiLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ draft: NonNullable<typeof aiDraft> }>('/api/admin/ai/assist', {
        method: 'POST',
        body: JSON.stringify({
          task: aiTask,
          input: { title: aiTitleInput, notes: aiNotesInput },
        }),
      });
      setAiDraft(res.draft);
      loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI assistant error.');
    } finally {
      setAiLoading(false);
    }
  }

  const navItems: Array<{ id: AdminSection; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'youtube', label: 'YouTube Auto Import', icon: Youtube },
    { id: 'content', label: 'Movies & Series', icon: Film },
    { id: 'live', label: 'Live TV & Reality', icon: Tv },
    { id: 'users', label: 'Users & RBAC', icon: Users },
    { id: 'finance', label: 'Finance & UPI', icon: CreditCard },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'ai', label: 'AI Assistant', icon: Sparkles },
    { id: 'compliance', label: 'Compliance & Setup', icon: ShieldAlert },
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar Navigation */}
        <aside className="lg:col-span-3 xl:col-span-2 rounded-2xl bg-[#111218] border border-white/[0.08] p-3 space-y-1">
          <div className="px-3 py-2 border-b border-white/[0.06] mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#D4AF37]">Super Admin</p>
            <p className="text-xs text-zinc-400 truncate mt-0.5">{user.email}</p>
          </div>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-colors cursor-pointer ${
                section === item.id
                  ? 'bg-[#E50914] text-white'
                  : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </aside>

        {/* Main Admin Workspace */}
        <div className="lg:col-span-9 xl:col-span-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
            <div>
              <p className="text-xs text-zinc-500">Super Admin / {navItems.find((n) => n.id === section)?.label}</p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
                {navItems.find((n) => n.id === section)?.label}
              </h1>
            </div>
            <button
              type="button"
              onClick={loadAdminData}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-[#121319] hover:bg-[#1a1c24] border border-white/10 px-3.5 py-2 text-xs text-zinc-200 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>

          {bannerMsg && (
            <div className="rounded-xl bg-emerald-950/50 border border-emerald-500/30 px-4 py-3 text-xs text-emerald-200">
              {bannerMsg}
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-red-950/50 border border-red-500/30 px-4 py-3 text-xs text-red-200">
              {error}
            </div>
          )}

          {/* 1. OVERVIEW */}
          {section === 'overview' && data && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {[
                  { label: 'Total Users', value: data.kpis.totalUsers.toLocaleString() },
                  { label: 'Active Users', value: data.kpis.activeUsers.toLocaleString() },
                  { label: 'Premium Subscribers', value: data.kpis.premiumSubscribers.toLocaleString() },
                  { label: 'Movies / Series', value: `${data.kpis.totalMovies} / ${data.kpis.totalSeries}` },
                  { label: 'Active Live Streams', value: data.kpis.activeLiveStreams.toLocaleString() },
                  { label: 'Total Views', value: data.kpis.totalViews.toLocaleString() },
                  { label: 'Watch Time (min)', value: data.kpis.watchTimeMinutes.toLocaleString() },
                  { label: 'Verified Revenue', value: `₹${data.kpis.subscriptionRevenue.toLocaleString()}` },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl bg-[#111218] border border-white/[0.08] p-4 space-y-1"
                  >
                    <p className="text-[11px] text-zinc-400">{stat.label}</p>
                    <p className="font-mono text-xl font-bold text-white tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="rounded-2xl bg-[#111218] border border-white/[0.08] p-5 space-y-3">
                  <h2 className="font-display text-base font-semibold text-white">Recent Transactions</h2>
                  <div className="divide-y divide-white/[0.06] text-xs">
                    {data.transactions.slice(0, 6).map((tx) => (
                      <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-zinc-100 truncate">{tx.userEmail}</p>
                          <p className="text-zinc-500 font-mono">{tx.planCode} · {tx.referenceId}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-white tabular-nums">₹{tx.amount}</p>
                          <p className="text-[11px] uppercase text-zinc-400">{tx.status.replace('_', ' ')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#111218] border border-white/[0.08] p-5 space-y-3">
                  <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#D4AF37]" />
                    Admin Activity Audit Log
                  </h2>
                  <div className="divide-y divide-white/[0.06] text-xs max-h-72 overflow-y-auto">
                    {data.activityLogs.slice(0, 10).map((log) => (
                      <div key={log.id} className="py-2.5 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[#D4AF37]">{log.action}</span>
                          <span className="text-[11px] text-zinc-500">
                            {new Date(log.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-zinc-300 truncate">{log.details}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. AUTOMATIC YOUTUBE MOVIE IMPORT */}
          {section === 'youtube' && (
            <div className="space-y-6">
              <form
                onSubmit={handleFetchYouTube}
                className="rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-4"
              >
                <div className="space-y-1">
                  <h2 className="font-display text-lg font-bold text-white">
                    Automatic YouTube Video &amp; Movie Metadata Importer
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Paste any official YouTube URL (e.g., https://www.youtube.com/watch?v=aqz-KE-bpKQ). Uses official YouTube APIs + TMDB matching, duplicate detection, and official YouTube Embedded Player playback.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    required
                    value={ytUrl}
                    onChange={(e) => setYtUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=aqz-KE-bpKQ"
                    aria-label="YouTube Video URL"
                    className="flex-1 rounded-xl bg-[#090a0e] border border-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:border-[#E50914]"
                  />
                  <button
                    type="submit"
                    disabled={ytFetching}
                    className="rounded-xl bg-[#E50914] hover:bg-[#c80812] disabled:opacity-50 text-white font-semibold text-sm px-6 py-3 whitespace-nowrap cursor-pointer"
                  >
                    {ytFetching ? 'Fetching Metadata...' : 'Fetch Video Details'}
                  </button>
                </div>
              </form>

              {/* Editable Import Preview */}
              {ytPreview && (
                <form
                  onSubmit={handlePublishYouTube}
                  className="rounded-2xl bg-[#111218] border border-[#D4AF37]/30 p-6 space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                    <div>
                      <p className="text-xs font-mono text-[#D4AF37]">
                        Video ID: {ytPreview.youtubeVideoId} · Source: {ytPreview.metadataSource}
                      </p>
                      <h3 className="font-display text-xl font-bold text-white mt-0.5">Import Preview &amp; Metadata Review</h3>
                    </div>
                    {ytPreview.isDuplicate && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-950/60 border border-amber-500/40 px-3 py-1.5 rounded-lg">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Duplicate: Already in catalog as "{ytPreview.duplicateTitleName}"
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-zinc-300 bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
                    {ytPreview.complianceNotice}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-3 space-y-2">
                      <div className="aspect-[3/4] rounded-xl overflow-hidden bg-black border border-white/10">
                        <MediaImage src={ytPreview.preview.posterUrl} alt="Import poster preview" className="w-full h-full object-cover" />
                      </div>
                      <input
                        type="url"
                        value={ytPreview.preview.posterUrl}
                        onChange={(e) =>
                          setYtPreview({
                            ...ytPreview,
                            preview: { ...ytPreview.preview, posterUrl: e.target.value },
                          })
                        }
                        aria-label="Poster URL"
                        className="w-full rounded-lg bg-[#090a0e] border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-300"
                      />
                    </div>

                    <div className="md:col-span-9 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-zinc-400">Movie / Video Title</label>
                        <input
                          type="text"
                          required
                          value={ytPreview.preview.title}
                          onChange={(e) =>
                            setYtPreview({ ...ytPreview, preview: { ...ytPreview.preview, title: e.target.value } })
                          }
                          className="w-full rounded-lg bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-zinc-400">Description</label>
                        <textarea
                          rows={3}
                          required
                          value={ytPreview.preview.description}
                          onChange={(e) =>
                            setYtPreview({
                              ...ytPreview,
                              preview: { ...ytPreview.preview, description: e.target.value },
                            })
                          }
                          className="w-full rounded-lg bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-400">Genres (comma separated)</label>
                        <input
                          type="text"
                          value={ytPreview.preview.genres.join(', ')}
                          onChange={(e) =>
                            setYtPreview({
                              ...ytPreview,
                              preview: {
                                ...ytPreview.preview,
                                genres: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                              },
                            })
                          }
                          className="w-full rounded-lg bg-[#090a0e] border border-white/10 px-3 py-2 text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-400">Language</label>
                        <input
                          type="text"
                          value={ytPreview.preview.language}
                          onChange={(e) =>
                            setYtPreview({
                              ...ytPreview,
                              preview: { ...ytPreview.preview, language: e.target.value },
                            })
                          }
                          className="w-full rounded-lg bg-[#090a0e] border border-white/10 px-3 py-2 text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-400">Release Year</label>
                        <input
                          type="number"
                          value={ytPreview.preview.releaseYear}
                          onChange={(e) =>
                            setYtPreview({
                              ...ytPreview,
                              preview: { ...ytPreview.preview, releaseYear: Number(e.target.value) },
                            })
                          }
                          className="w-full rounded-lg bg-[#090a0e] border border-white/10 px-3 py-2 text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-zinc-400">Director / Rights Holder</label>
                        <input
                          type="text"
                          value={ytPreview.preview.director}
                          onChange={(e) =>
                            setYtPreview({
                              ...ytPreview,
                              preview: { ...ytPreview.preview, director: e.target.value },
                            })
                          }
                          className="w-full rounded-lg bg-[#090a0e] border border-white/10 px-3 py-2 text-white"
                        />
                      </div>

                      <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setYtPreview(null)}
                          className="rounded-xl bg-white/10 px-4 py-2.5 text-xs text-zinc-200 cursor-pointer"
                        >
                          Discard Preview
                        </button>
                        <button
                          type="submit"
                          disabled={ytPreview.isDuplicate}
                          className="rounded-xl bg-[#E50914] hover:bg-[#c80812] disabled:opacity-40 text-white font-semibold px-6 py-2.5 text-xs cursor-pointer"
                        >
                          Publish to Homepage
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              )}

              {/* Import History & Failed Import Retry */}
              {data && (
                <div className="rounded-2xl bg-[#111218] border border-white/[0.08] p-5 space-y-3">
                  <h3 className="font-display text-base font-semibold text-white">YouTube Import History</h3>
                  {data.youtubeImports.length === 0 ? (
                    <p className="text-xs text-zinc-500">No YouTube imports recorded yet.</p>
                  ) : (
                    <div className="divide-y divide-white/[0.06] text-xs">
                      {data.youtubeImports.map((imp) => (
                        <div key={imp.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">
                              {imp.fetchedTitle || imp.youtubeUrl}
                            </p>
                            <p className="text-zinc-500 font-mono">
                              ID: {imp.youtubeVideoId} · {imp.status.toUpperCase()}
                              {imp.errorMessage ? ` · ${imp.errorMessage}` : ''}
                            </p>
                          </div>
                          {imp.status === 'failed' && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const retried = await apiFetch<NonNullable<typeof ytPreview>>(
                                    `/api/admin/youtube/retry/${imp.id}`,
                                    { method: 'POST' }
                                  );
                                  setYtPreview(retried);
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Retry failed.');
                                }
                              }}
                              className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs text-white cursor-pointer"
                            >
                              Retry Import
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. MOVIES & SERIES CONTENT MANAGER */}
          {section === 'content' && data && (
            <div className="space-y-6">
              <form
                onSubmit={handleCreateManualTitle}
                className="rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-4 text-xs"
              >
                <h2 className="font-display text-lg font-bold text-white">Add Movie or Web Series</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <select
                    value={newTitle.type}
                    onChange={(e) => setNewTitle({ ...newTitle, type: e.target.value as 'movie' | 'series' })}
                    className="rounded-xl bg-[#090a0e] border border-white/10 px-3 py-2.5 text-white"
                  >
                    <option value="movie">Movie</option>
                    <option value="series">Web Series</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={newTitle.title}
                    onChange={(e) => setNewTitle({ ...newTitle, title: e.target.value })}
                    placeholder="Title Name"
                    className="rounded-xl bg-[#090a0e] border border-white/10 px-3 py-2.5 text-white"
                  />
                  <input
                    type="text"
                    value={newTitle.language}
                    onChange={(e) => setNewTitle({ ...newTitle, language: e.target.value })}
                    placeholder="Language"
                    className="rounded-xl bg-[#090a0e] border border-white/10 px-3 py-2.5 text-white"
                  />
                  <select
                    value={newTitle.videoSourceType}
                    onChange={(e) =>
                      setNewTitle({
                        ...newTitle,
                        videoSourceType: e.target.value as 'hls' | 'youtube' | 'dash' | 'direct',
                      })
                    }
                    className="rounded-xl bg-[#090a0e] border border-white/10 px-3 py-2.5 text-white"
                  >
                    <option value="hls">HLS (.m3u8)</option>
                    <option value="youtube">Official YouTube Embed</option>
                    <option value="dash">MPEG-DASH</option>
                    <option value="direct">Authorized Direct Video URL</option>
                  </select>
                  <input
                    type="url"
                    required
                    value={newTitle.videoUrl}
                    onChange={(e) => setNewTitle({ ...newTitle, videoUrl: e.target.value })}
                    placeholder="Authorized Playback URL"
                    className="sm:col-span-2 rounded-xl bg-[#090a0e] border border-white/10 px-3 py-2.5 text-white"
                  />
                  <textarea
                    rows={2}
                    required
                    value={newTitle.description}
                    onChange={(e) => setNewTitle({ ...newTitle, description: e.target.value })}
                    placeholder="Synopsis..."
                    className="sm:col-span-3 rounded-xl bg-[#090a0e] border border-white/10 px-3 py-2.5 text-white"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTitle.isPremium}
                      onChange={(e) => setNewTitle({ ...newTitle, isPremium: e.target.checked })}
                      className="accent-[#E50914]"
                    />
                    VIP / Premium Title
                  </label>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold px-5 py-2.5 cursor-pointer"
                  >
                    Publish Title
                  </button>
                </div>
              </form>

              <div className="rounded-2xl bg-[#111218] border border-white/[0.08] overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/[0.08] text-zinc-400">
                    <tr>
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3 text-right">Views</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {data.titles.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-white">{t.title}</td>
                        <td className="px-4 py-3 capitalize text-zinc-300">{t.type}</td>
                        <td className="px-4 py-3 uppercase font-mono text-zinc-400">{t.videoSourceType}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-300">
                          {t.viewsCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={t.published ? 'text-emerald-400' : 'text-amber-400'}>
                            {t.published ? 'Published' : 'Unpublished'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/titles/${t.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ published: !t.published }),
                              });
                              loadAdminData();
                              onCatalogUpdated();
                            }}
                            className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                          >
                            {t.published ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/titles/${t.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ isFeatured: !t.isFeatured }),
                              });
                              loadAdminData();
                              onCatalogUpdated();
                            }}
                            className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[#D4AF37] cursor-pointer"
                          >
                            {t.isFeatured ? 'Hero ✓' : 'Set Hero'}
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${t.title}`}
                            onClick={async () => {
                              await apiFetch(`/api/admin/titles/${t.id}`, { method: 'DELETE' });
                              loadAdminData();
                              onCatalogUpdated();
                            }}
                            className="p-1.5 rounded bg-red-950/60 hover:bg-red-900 text-red-300 cursor-pointer inline-flex align-middle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. LIVE TV & REALITY MULTI-CAM MANAGEMENT */}
          {section === 'live' && data && (
            <div className="space-y-6">
              {rotatedCamKey && (
                <div className="rounded-xl bg-[#1b1512] border border-[#D4AF37]/40 p-4 text-xs space-y-1">
                  <p className="font-semibold text-[#D4AF37]">
                    New One-Time RTMP Stream Key for {rotatedCamKey.camName} (copy now — never shown again):
                  </p>
                  <p className="font-mono text-white">{rotatedCamKey.key}</p>
                </div>
              )}

              {/* Reality Cameras Control Board */}
              {data.realityShows.map((show) => (
                <div key={show.id} className="rounded-2xl bg-[#111218] border border-white/[0.08] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                      <Camera className="w-4 h-4 text-[#E50914]" />
                      {show.name} — Multi-Camera RTMP / HLS Control Desk
                    </h2>
                    <span className="text-xs text-zinc-400">{show.cameras.length} Cameras Configured</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {show.cameras.map((cam) => (
                      <div key={cam.id} className="rounded-xl bg-[#0a0b0f] border border-white/[0.08] p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{cam.name}</span>
                          <span className={cam.isOnline ? 'text-emerald-400' : 'text-zinc-500'}>
                            {cam.isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {cam.zone} · Key {cam.streamKeyHint}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/reality-cameras/${cam.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ isOnline: !cam.isOnline }),
                              });
                              loadAdminData();
                            }}
                            className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                          >
                            {cam.isOnline ? 'Set Offline' : 'Go Online'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await apiFetch<{ oneTimeStreamKey?: string }>(
                                `/api/admin/reality-cameras/${cam.id}`,
                                { method: 'PATCH', body: JSON.stringify({ rotateStreamKey: true }) }
                              );
                              if (res.oneTimeStreamKey) {
                                setRotatedCamKey({ camName: cam.name, key: res.oneTimeStreamKey });
                              }
                              loadAdminData();
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[#D4AF37] cursor-pointer"
                          >
                            <KeyRound className="w-3 h-3" />
                            Rotate Key
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Add Live TV Channel */}
              <form
                onSubmit={handleAddChannel}
                className="rounded-2xl bg-[#111218] border border-white/[0.08] p-5 space-y-4 text-xs"
              >
                <h3 className="font-display text-base font-bold text-white">Add Live TV Channel</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={newChannel.name}
                    onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                    placeholder="Channel Name"
                    className="rounded-lg bg-[#090a0e] border border-white/10 px-3 py-2 text-white"
                  />
                  <input
                    type="text"
                    value={newChannel.category}
                    onChange={(e) => setNewChannel({ ...newChannel, category: e.target.value })}
                    placeholder="Category (News, Movies, Sports)"
                    className="rounded-lg bg-[#090a0e] border border-white/10 px-3 py-2 text-white"
                  />
                  <input
                    type="text"
                    value={newChannel.currentProgram}
                    onChange={(e) => setNewChannel({ ...newChannel, currentProgram: e.target.value })}
                    placeholder="Current Program"
                    className="rounded-lg bg-[#090a0e] border border-white/10 px-3 py-2 text-white"
                  />
                  <input
                    type="url"
                    required
                    value={newChannel.hlsUrl}
                    onChange={(e) => setNewChannel({ ...newChannel, hlsUrl: e.target.value })}
                    placeholder="Authorized HLS (.m3u8) URL"
                    className="sm:col-span-2 rounded-lg bg-[#090a0e] border border-white/10 px-3 py-2 text-white"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[#E50914] hover:bg-[#c80812] text-white font-semibold py-2 cursor-pointer"
                  >
                    Add Channel
                  </button>
                </div>

                <div className="divide-y divide-white/[0.06] pt-2">
                  {data.channels.map((ch) => (
                    <div key={ch.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-white font-medium">{ch.name}</p>
                        <p className="text-zinc-500">
                          {ch.category} · {ch.language} · {ch.currentProgram}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/channels/${ch.id}`, { method: 'DELETE' });
                          loadAdminData();
                          onCatalogUpdated();
                        }}
                        className="px-2.5 py-1 rounded bg-red-950/60 text-red-300 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </form>
            </div>
          )}

          {/* 5. USERS & RBAC */}
          {section === 'users' && data && (
            <div className="rounded-2xl bg-[#111218] border border-white/[0.08] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/[0.08] text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {data.users.map((u) => (
                    <tr key={u.uid}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{u.username}</p>
                        <p className="text-zinc-500">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Role for ${u.email}`}
                          value={u.role}
                          onChange={async (e) => {
                            await apiFetch(`/api/admin/users/${encodeURIComponent(u.uid)}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ role: e.target.value }),
                            });
                            loadAdminData();
                          }}
                          className="rounded bg-[#090a0e] border border-white/10 px-2 py-1 text-white"
                        >
                          <option value="user">User</option>
                          <option value="broadcaster">Broadcaster</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Subscription for ${u.email}`}
                          value={u.subscriptionTier}
                          onChange={async (e) => {
                            await apiFetch(`/api/admin/users/${encodeURIComponent(u.uid)}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ subscriptionTier: e.target.value }),
                            });
                            loadAdminData();
                          }}
                          className="rounded bg-[#090a0e] border border-white/10 px-2 py-1 text-white"
                        >
                          <option value="free">Free</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 capitalize text-zinc-300">{u.status}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const next = u.status === 'active' ? 'suspended' : 'active';
                            await apiFetch(`/api/admin/users/${encodeURIComponent(u.uid)}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: next }),
                            });
                            loadAdminData();
                          }}
                          className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                        >
                          {u.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 6. FINANCE, UPI SETTINGS & RECONCILIATION */}
          {section === 'finance' && data && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveUpi}
                className="rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-4 text-xs"
              >
                <h2 className="font-display text-lg font-bold text-white">UPI ID, QR &amp; Payment Gateway Settings</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <input
                    type="text"
                    required
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="UPI ID (e.g., kinostage@okhdfcbank)"
                    className="rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-white font-mono"
                  />
                  <input
                    type="text"
                    required
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    placeholder="Merchant Name"
                    className="rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-white"
                  />
                  <input
                    type="text"
                    value={qrNote}
                    onChange={(e) => setQrNote(e.target.value)}
                    placeholder="QR Payment Note"
                    className="rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold px-5 py-2.5 cursor-pointer"
                >
                  Save Payment Settings
                </button>
              </form>

              <div className="rounded-2xl bg-[#111218] border border-white/[0.08] overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/[0.08] text-zinc-400">
                    <tr>
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">UTR / Ref</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Reconciliation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {data.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-4 py-3 text-white">{tx.userEmail}</td>
                        <td className="px-4 py-3 uppercase text-zinc-300">{tx.planCode}</td>
                        <td className="px-4 py-3 font-mono text-zinc-300">{tx.referenceId}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-white">₹{tx.amount}</td>
                        <td className="px-4 py-3 uppercase font-mono text-zinc-300">{tx.status.replace('_', ' ')}</td>
                        <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                          {tx.status === 'pending_verification' && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiFetch(`/api/admin/transactions/${tx.id}/verify`, {
                                    method: 'POST',
                                    body: JSON.stringify({ action: 'verify' }),
                                  });
                                  loadAdminData();
                                }}
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                              >
                                Verify &amp; Activate
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiFetch(`/api/admin/transactions/${tx.id}/verify`, {
                                    method: 'POST',
                                    body: JSON.stringify({ action: 'reject' }),
                                  });
                                  loadAdminData();
                                }}
                                className="px-2.5 py-1 rounded bg-red-900/70 text-red-200 cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {tx.status === 'verified' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/transactions/${tx.id}/verify`, {
                                  method: 'POST',
                                  body: JSON.stringify({ action: 'refund' }),
                                });
                                loadAdminData();
                              }}
                              className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-zinc-200 cursor-pointer"
                            >
                              Issue Refund
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. NOTIFICATION MANAGEMENT */}
          {section === 'notifications' && data && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleSendNotification}
                className="lg:col-span-6 rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-4 text-xs"
              >
                <h2 className="font-display text-lg font-bold text-white">Dispatch Real-Time Push Notification</h2>
                <select
                  value={notifType}
                  onChange={(e) => setNotifType(e.target.value)}
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-white"
                >
                  <option value="new_movie">New Movie Alert</option>
                  <option value="live_now">Live Now Alert</option>
                  <option value="upcoming_show">Upcoming Show Alert</option>
                  <option value="subscription_expiry">Subscription Expiry Alert</option>
                </select>
                <input
                  type="text"
                  required
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="Notification Headline"
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                />
                <textarea
                  rows={3}
                  required
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                  placeholder="Alert message body..."
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold px-5 py-2.5 cursor-pointer"
                >
                  Broadcast Live Alert
                </button>
              </form>

              <div className="lg:col-span-6 rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-3">
                <h3 className="font-display text-base font-semibold text-white">Recent Dispatched Alerts</h3>
                <div className="divide-y divide-white/[0.06] text-xs">
                  {data.notifications.map((n) => (
                    <div key={n.id} className="py-3 space-y-1">
                      <p className="font-semibold text-white">{n.title}</p>
                      <p className="text-zinc-400">{n.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 8. AI AGENT MANAGEMENT */}
          {section === 'ai' && (
            <div className="space-y-6">
              <form
                onSubmit={handleRunAi}
                className="rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-4 text-xs"
              >
                <div>
                  <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                    Editorial &amp; Catalog AI Management Assistant
                  </h2>
                  <p className="text-zinc-400 mt-1">
                    All AI-generated metadata, duplicate audits, and weekly executive reports are produced as reviewable drafts and are never auto-published without administrator approval.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'weekly_report', label: 'Weekly Report' },
                    { id: 'analyze_trends', label: 'Viewing Trends' },
                    { id: 'suggest_featured', label: 'Suggest Featured' },
                    { id: 'detect_duplicates', label: 'Detect Duplicates' },
                    { id: 'generate_description', label: 'Generate Synopsis' },
                    { id: 'suggest_categories', label: 'Suggest Categories' },
                    { id: 'generate_tags', label: 'Generate Tags' },
                    { id: 'recommend_posters', label: 'Poster Concepts' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAiTask(t.id as typeof aiTask)}
                      className={`px-3 py-2 rounded-xl font-medium text-left cursor-pointer border ${
                        aiTask === t.id
                          ? 'bg-[#E50914] border-[#E50914] text-white'
                          : 'bg-[#090a0e] border-white/10 text-zinc-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={aiTitleInput}
                    onChange={(e) => setAiTitleInput(e.target.value)}
                    placeholder="Target movie/series title (optional for catalog-wide tasks)"
                    className="rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                  />
                  <input
                    type="text"
                    value={aiNotesInput}
                    onChange={(e) => setAiNotesInput(e.target.value)}
                    placeholder="Editorial notes, cast, language, or mood..."
                    className="rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={aiLoading}
                  className="rounded-xl bg-[#E50914] hover:bg-[#c80812] disabled:opacity-50 text-white font-semibold px-6 py-2.5 cursor-pointer"
                >
                  {aiLoading ? 'Generating Review Draft...' : 'Generate Admin Draft'}
                </button>
              </form>

              {aiDraft && (
                <div className="rounded-2xl bg-[#111218] border border-[#D4AF37]/35 p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-bold text-white">{aiDraft.headline}</h3>
                    <span className="text-[11px] font-semibold uppercase text-[#D4AF37]">
                      Draft · Admin Review Required
                    </span>
                  </div>
                  <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">{aiDraft.summary}</p>
                  {aiDraft.suggestedItems.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-zinc-400">Suggestions &amp; Findings</p>
                      <ul className="space-y-1 text-xs text-zinc-300 list-disc pl-5">
                        {aiDraft.suggestedItems.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="rounded-xl bg-[#0a0b0f] border border-white/[0.08] p-4 space-y-1.5">
                    <p className="text-xs font-semibold text-[#D4AF37]">Pre-Publish Admin Review Checklist</p>
                    <ul className="space-y-1 text-xs text-zinc-400">
                      {aiDraft.reviewChecklist.map((c, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 9. COMPLIANCE, TAKEDOWNS & INTEGRATIONS SETUP */}
          {section === 'compliance' && data && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-white">
                  External Service Credentials &amp; Infrastructure Setup
                </h2>
                <p className="text-xs text-zinc-400">
                  Configure optional external keys in Settings → Secrets (server-side environment variables only; never exposed to browser code).
                </p>
                {setupStatus && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                    {[
                      { name: 'Cloud SQL (PostgreSQL)', ok: setupStatus.cloudSql, env: 'Provisioned via Cloud SQL' },
                      { name: 'Firebase Authentication', ok: setupStatus.firebaseAuth, env: 'Provisioned via OAuth' },
                      { name: 'Gemini AI Admin Assistant', ok: setupStatus.geminiAi, env: 'GEMINI_API_KEY' },
                      { name: 'YouTube Data API v3', ok: setupStatus.youtubeDataApi, env: 'YOUTUBE_API_KEY (oEmbed active)' },
                      { name: 'TMDB Movie Metadata API', ok: setupStatus.tmdbApi, env: 'TMDB_API_KEY' },
                      { name: 'Payment Gateway Webhook', ok: setupStatus.paymentGateway, env: 'PAYMENT_GATEWAY_KEY' },
                    ].map((svc) => (
                      <div key={svc.name} className="rounded-xl bg-[#0a0b0f] border border-white/[0.08] p-3.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{svc.name}</span>
                          <span className={svc.ok ? 'text-emerald-400 font-mono' : 'text-amber-400 font-mono'}>
                            {svc.ok ? 'ACTIVE' : 'SETUP'}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-zinc-500">{svc.env}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-white">Copyright Reports &amp; Takedown Queue</h2>
                <div className="divide-y divide-white/[0.06] text-xs">
                  {data.copyrightReports.map((rep) => (
                    <div key={rep.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-0.5 max-w-xl">
                        <p className="font-semibold text-white">
                          {rep.titleName || 'Catalog Inquiry'} · <span className="text-zinc-400">{rep.claimType}</span>
                        </p>
                        <p className="text-zinc-400">
                          {rep.reporterName} ({rep.reporterEmail}) — {rep.details}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono uppercase text-zinc-400">{rep.status.replace('_', ' ')}</span>
                        {rep.status !== 'takedown_executed' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/compliance/${rep.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ status: 'takedown_executed' }),
                              });
                              loadAdminData();
                              onCatalogUpdated();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-red-900/70 hover:bg-red-800 text-red-100 cursor-pointer"
                          >
                            Execute Takedown
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
