import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera, Grid2x2, Maximize2, Play, Radio, ThumbsUp, Users, Video } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { RealityCamera, RealityEpisode, RealityShowItem, UserProfile } from '../types/ott';
import { LiveChatPanel } from './LiveChatPanel';
import { MediaImage } from './MediaImage';

interface RealityShowViewProps {
  user: UserProfile | null;
  onPlayEpisode: (ep: RealityEpisode, showName: string) => void;
}

export function RealityShowView({ user, onPlayEpisode }: RealityShowViewProps) {
  const [shows, setShows] = useState<RealityShowItem[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<number | null>(null);
  const [activeCamId, setActiveCamId] = useState<number | null>(null);
  const [quadMode, setQuadMode] = useState(false);
  const [episodeFilter, setEpisodeFilter] = useState<'all' | 'upcoming' | 'previous' | 'highlight' | 'replay'>('all');
  const [votedIds, setVotedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [voteFeedback, setVoteFeedback] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    apiFetch<{ shows: RealityShowItem[] }>('/api/reality-shows')
      .then((res) => {
        setShows(res.shows);
        if (res.shows[0]) {
          setSelectedShowId(res.shows[0].id);
          const firstOnline = res.shows[0].cameras.find((c) => c.isOnline) || res.shows[0].cameras[0];
          if (firstOnline) setActiveCamId(firstOnline.id);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const activeShow = shows.find((s) => s.id === selectedShowId) || shows[0] || null;
  const activeCamera: RealityCamera | null =
    activeShow?.cameras.find((c) => c.id === activeCamId) || activeShow?.cameras[0] || null;

  // Mount HLS feed for selected reality house camera
  useEffect(() => {
    if (quadMode || !activeCamera || !activeCamera.isOnline) return;
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (activeCamera.hlsPlaybackUrl.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(activeCamera.hlsPlaybackUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else {
      video.src = activeCamera.hlsPlaybackUrl;
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeCamera, quadMode]);

  const handleWsParticipantVote = useCallback((updated: { id: number; votesCount: number }) => {
    setShows((prev) =>
      prev.map((show) => ({
        ...show,
        participants: show.participants.map((p) =>
          p.id === updated.id ? { ...p, votesCount: updated.votesCount } : p
        ),
      }))
    );
  }, []);

  async function handleVoteParticipant(participantId: number, name: string) {
    if (!activeShow) return;
    try {
      const res = await apiFetch<{ participant: { id: number; votesCount: number } }>(
        `/api/reality-shows/${activeShow.id}/vote`,
        {
          method: 'POST',
          body: JSON.stringify({ participantId }),
        }
      );
      handleWsParticipantVote(res.participant);
      setVotedIds((prev) => new Set(prev).add(participantId));
      setVoteFeedback(`Vote recorded for ${name}.`);
    } catch (err) {
      setVoteFeedback(err instanceof Error ? err.message : 'Unable to cast vote.');
    }
  }

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12 py-10 space-y-6 animate-pulse">
        <div className="h-[460px] rounded-2xl bg-[#121319]" />
      </div>
    );
  }

  if (!activeShow) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center text-zinc-400">
        No reality shows are currently scheduled.
      </div>
    );
  }

  const filteredEpisodes =
    episodeFilter === 'all'
      ? activeShow.episodes
      : activeShow.episodes.filter((e) => e.kind === episodeFilter);

  const totalVotes = activeShow.participants.reduce((acc, p) => acc + p.votesCount, 0) || 1;

  return (
    <div className="max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12 py-8 pb-20 space-y-10">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#E50914] inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#E50914] animate-pulse" />
            24/7 Multi-Camera Reality House
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">{activeShow.name}</h1>
          <p className="text-xs text-zinc-400">{activeShow.episodeSchedule}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {shows.length > 1 &&
            shows.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedShowId(s.id);
                  if (s.cameras[0]) setActiveCamId(s.cameras[0].id);
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                  s.id === activeShow.id ? 'bg-[#E50914] text-white' : 'bg-[#121319] text-zinc-300 border border-white/10'
                }`}
              >
                {s.name}
              </button>
            ))}

          <button
            type="button"
            onClick={() => setQuadMode((q) => !q)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer border ${
              quadMode
                ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                : 'bg-[#121319] text-zinc-200 border-white/10 hover:border-white/25'
            }`}
          >
            {quadMode ? <Maximize2 className="w-3.5 h-3.5" /> : <Grid2x2 className="w-3.5 h-3.5" />}
            {quadMode ? 'Single Camera View' : 'Quad Multi-Cam View'}
          </button>
        </div>
      </div>

      {/* Main Live Stage + Real-Time WebSocket Chat/Polls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-5">
          {/* Active Video Feed or Quad Multi-Camera Wall */}
          {quadMode ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeShow.cameras.slice(0, 4).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => {
                    setActiveCamId(cam.id);
                    setQuadMode(false);
                  }}
                  className="relative aspect-video rounded-xl overflow-hidden bg-black border border-white/10 hover:border-[#E50914] text-left cursor-pointer group"
                >
                  <MediaImage src={activeShow.coverUrl} alt={cam.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30" />
                  <div className="absolute top-3 left-3 flex items-center gap-2 text-[11px] font-semibold text-white bg-black/75 px-2.5 py-1 rounded">
                    <span className={`w-1.5 h-1.5 rounded-full ${cam.isOnline ? 'bg-[#E50914] animate-pulse' : 'bg-zinc-500'}`} />
                    {cam.name}
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-zinc-200">
                    <span>{cam.zone}</span>
                    <span className="font-mono tabular-nums">{cam.viewerCount.toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-white/10">
              {activeCamera?.isOnline ? (
                <video
                  ref={videoRef}
                  controls
                  muted
                  playsInline
                  poster={activeShow.coverUrl}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#0c0d12] text-zinc-400 p-8 text-center space-y-2">
                  <Camera className="w-10 h-10 text-zinc-600" />
                  <p className="font-display text-lg font-semibold text-white">
                    {activeCamera?.name} is currently Offline
                  </p>
                  <p className="text-xs text-zinc-400 max-w-sm">
                    House lights are down in {activeCamera?.zone}. Switch to any active camera angle below.
                  </p>
                </div>
              )}

              {/* Minimal Broadcast Overlay */}
              {activeCamera && (
                <div className="pointer-events-none absolute top-4 left-4 right-4 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-black/80 backdrop-blur-sm px-3 py-1.5 text-xs font-semibold text-white">
                    <span className={`w-2 h-2 rounded-full ${activeCamera.isOnline ? 'bg-[#E50914] animate-pulse' : 'bg-zinc-500'}`} />
                    {activeCamera.name} · {activeCamera.zone}
                  </div>
                  <div className="inline-flex items-center gap-3 rounded-lg bg-black/80 backdrop-blur-sm px-3 py-1.5 text-xs font-mono text-zinc-200 tabular-nums">
                    {activeCamera.isRecording && <span className="text-[#E50914]">REC</span>}
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {activeCamera.viewerCount.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 9-Camera Switcher Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-[#E50914]" />
                Select House Camera ({activeShow.cameras.filter((c) => c.isOnline).length}/{activeShow.cameras.length} Online)
              </h2>
              <span className="text-xs text-zinc-400">HLS Low-Latency Multi-Cam</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {activeShow.cameras.map((cam) => {
                const isSelected = activeCamera?.id === cam.id && !quadMode;
                return (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => {
                      setActiveCamId(cam.id);
                      setQuadMode(false);
                    }}
                    className={`rounded-xl p-3 text-left border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#E50914]/15 border-[#E50914] text-white'
                        : 'bg-[#111218] border-white/[0.08] text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold truncate">{cam.name}</span>
                      <span
                        className={`text-[10px] font-mono uppercase ${
                          cam.isOnline ? 'text-emerald-400' : 'text-zinc-500'
                        }`}
                      >
                        {cam.isOnline ? 'Live' : 'Offline'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 truncate mt-1">
                      {cam.zone} · <span className="font-mono tabular-nums">{cam.viewerCount.toLocaleString()}</span>
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Real-Time Chat & Polls Column */}
        <div className="lg:col-span-4">
          <LiveChatPanel
            roomId={`reality-${activeShow.id}`}
            baseViewers={activeShow.viewerCount}
            user={user}
            onParticipantVoted={handleWsParticipantVote}
          />
        </div>
      </div>

      {/* House Participants & Live Audience Voting */}
      <section className="space-y-4 border-t border-white/[0.08] pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Housemates &amp; Audience Voting</h2>
            <p className="text-xs text-zinc-400 mt-1">Cast your live vote to save nominated housemates from Sunday eviction</p>
          </div>
          {voteFeedback && <p className="text-xs font-medium text-[#D4AF37]">{voteFeedback}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeShow.participants.map((p) => {
            const share = Math.round((p.votesCount / totalVotes) * 100);
            const isEvicted = p.status === 'evicted';
            return (
              <div
                key={p.id}
                className="rounded-xl bg-[#111218] border border-white/[0.08] p-4 flex items-center gap-4"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-white/10">
                  <MediaImage src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-semibold text-white truncate">{p.name}</h3>
                    <span
                      className={`text-[11px] font-semibold uppercase ${
                        p.status === 'nominated'
                          ? 'text-[#E50914]'
                          : p.status === 'evicted'
                            ? 'text-zinc-500'
                            : 'text-emerald-400'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate">{p.role}</p>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-[#D4AF37]" style={{ width: `${share}%` }} />
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                      {p.votesCount.toLocaleString()} votes ({share}%)
                    </span>
                    <button
                      type="button"
                      disabled={isEvicted}
                      onClick={() => handleVoteParticipant(p.id, p.name)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#E50914] hover:bg-[#c80812] disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-semibold px-3 py-1.5 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ThumbsUp className="w-3 h-3" />
                      {votedIds.has(p.id) ? 'Vote Again' : 'Vote'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Episodes, Highlights, Upcoming & 24/7 Replays */}
      <section className="space-y-5 border-t border-white/[0.08] pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-bold text-white">Episodes, Highlights &amp; Replays</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'upcoming', 'previous', 'highlight', 'replay'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setEpisodeFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                  episodeFilter === tab
                    ? 'bg-[#E50914] text-white'
                    : 'bg-[#111218] text-zinc-300 border border-white/[0.08]'
                }`}
              >
                {tab === 'all' ? 'All Clips' : `${tab}s`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredEpisodes.map((ep) => (
            <button
              key={ep.id}
              type="button"
              onClick={() => onPlayEpisode(ep, activeShow.name)}
              className="group text-left rounded-xl overflow-hidden bg-[#111218] border border-white/[0.08] hover:border-white/20 cursor-pointer"
            >
              <div className="relative aspect-video">
                <MediaImage src={ep.thumbnailUrl} alt={ep.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/35 group-hover:bg-black/20 flex items-center justify-center">
                  <span className="w-10 h-10 rounded-full bg-[#E50914] text-white flex items-center justify-center">
                    <Play className="w-4 h-4 fill-current" />
                  </span>
                </div>
                <span className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[11px] font-mono text-zinc-200 tabular-nums">
                  {ep.durationMinutes}m
                </span>
              </div>
              <div className="p-3.5 space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-[#D4AF37]">
                  {ep.kind} · {ep.airDate}
                </p>
                <h3 className="font-display text-sm font-semibold text-white line-clamp-2">{ep.title}</h3>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
