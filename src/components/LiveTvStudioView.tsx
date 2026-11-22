import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Radio,
  Tv,
  Calendar,
  Video,
  VideoOff,
  Mic,
  MicOff,
  KeyRound,
  Copy,
  Check,
  StopCircle,
  Play,
  Clock,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { LiveChannelItem, LiveEventItem, StudioStreamItem, UserProfile } from '../types/ott';
import { buildYouTubeEmbedUrl } from '../utils/ott';
import { LiveChatPanel } from './LiveChatPanel';
import { MediaImage } from './MediaImage';

interface LiveTvStudioViewProps {
  user: UserProfile | null;
  initialChannelId?: number | null;
  onRequireAuth: () => void;
  onPlayEvent: (ev: LiveEventItem) => void;
}

export function LiveTvStudioView({
  user,
  initialChannelId,
  onRequireAuth,
  onPlayEvent,
}: LiveTvStudioViewProps) {
  const [subTab, setSubTab] = useState<'tv' | 'events' | 'studio'>('tv');
  const [channels, setChannels] = useState<LiveChannelItem[]>([]);
  const [events, setEvents] = useState<LiveEventItem[]>([]);
  const [studioStreams, setStudioStreams] = useState<StudioStreamItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(initialChannelId || null);
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Go Live Studio state
  const [streamTitle, setStreamTitle] = useState('');
  const [streamCategory, setStreamCategory] = useState('Premiere Live');
  const [streamDesc, setStreamDesc] = useState('');
  const [saveRecording, setSaveRecording] = useState(true);
  const [camEnabled, setCamEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [activeStudioStream, setActiveStudioStream] = useState<StudioStreamItem | null>(null);
  const [oneTimeStreamKey, setOneTimeStreamKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [studioStatusMsg, setStudioStatusMsg] = useState<string | null>(null);

  const tvVideoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ channels: LiveChannelItem[] }>('/api/live/channels'),
      apiFetch<{ events: LiveEventItem[] }>('/api/live/events'),
      apiFetch<{ streams: StudioStreamItem[] }>('/api/studio/streams'),
    ]).then(([chRes, evRes, stRes]) => {
      setChannels(chRes.channels);
      setEvents(evRes.events);
      setStudioStreams(stRes.streams);
      if (!selectedChannelId && chRes.channels[0]) {
        setSelectedChannelId(chRes.channels[0].id);
      }
      const liveStudio = stRes.streams.find((s) => s.status === 'live');
      if (liveStudio) setActiveStudioStream(liveStudio);
    });
  }, []);

  useEffect(() => {
    if (initialChannelId) {
      setSelectedChannelId(initialChannelId);
      setSubTab('tv');
    }
  }, [initialChannelId]);

  const activeChannel = channels.find((c) => c.id === selectedChannelId) || channels[0] || null;

  // Mount Live TV HLS stream
  useEffect(() => {
    if (subTab !== 'tv' || !activeChannel || activeChannel.streamType === 'youtube') return;
    const video = tvVideoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (activeChannel.hlsUrl.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(activeChannel.hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else {
      video.src = activeChannel.hlsUrl;
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [subTab, activeChannel]);

  // Clean up local WebRTC camera/mic on unmount
  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function toggleLocalMedia(wantCam: boolean, wantMic: boolean) {
    setMediaError(null);
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    if (!wantCam && !wantMic) {
      setCamEnabled(false);
      setMicEnabled(false);
      if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError('Browser camera/microphone API is unavailable. Connect OBS Studio via RTMP Ingest below.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: wantCam, audio: wantMic });
      mediaStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.play().catch(() => {});
      }
      setCamEnabled(wantCam);
      setMicEnabled(wantMic);
    } catch {
      setMediaError('Camera or microphone permission unavailable in this browser. You can still broadcast via OBS Studio / External RTMP Encoder.');
    }
  }

  async function handleStartStudioStream(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    setStudioStatusMsg(null);
    try {
      const res = await apiFetch<{ stream: StudioStreamItem; oneTimeStreamKey: string }>('/api/studio/streams', {
        method: 'POST',
        body: JSON.stringify({
          title: streamTitle,
          description: streamDesc,
          category: streamCategory,
          saveRecording,
        }),
      });
      setActiveStudioStream(res.stream);
      setOneTimeStreamKey(res.oneTimeStreamKey);
      setStudioStreams((prev) => [res.stream, ...prev]);
      setStreamTitle('');
      setStreamDesc('');
      setStudioStatusMsg('Live broadcast started! Copy your one-time RTMP stream key below for OBS Studio.');
    } catch (err) {
      setStudioStatusMsg(err instanceof Error ? err.message : 'Unable to start live stream.');
    }
  }

  async function handleEndStudioStream(streamId: number) {
    try {
      const res = await apiFetch<{ stream: StudioStreamItem }>(`/api/studio/streams/${streamId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ended' }),
      });
      setActiveStudioStream(null);
      setOneTimeStreamKey(null);
      setStudioStreams((prev) => prev.map((s) => (s.id === streamId ? res.stream : s)));
      setStudioStatusMsg('Stream ended and authorized recording archived.');
    } catch (err) {
      setStudioStatusMsg(err instanceof Error ? err.message : 'Unable to end stream.');
    }
  }

  async function handleRsvp(eventId: number) {
    try {
      const res = await apiFetch<{ event: LiveEventItem }>(`/api/live/events/${eventId}/rsvp`, { method: 'POST' });
      setEvents((prev) => prev.map((e) => (e.id === eventId ? res.event : e)));
    } catch {
      // Ignore
    }
  }

  const categories = ['All', ...Array.from(new Set(channels.map((c) => c.category)))];
  const filteredChannels =
    categoryFilter === 'All' ? channels : channels.filter((c) => c.category === categoryFilter);

  const ytEmbed =
    activeChannel?.streamType === 'youtube' && activeChannel.youtubeEmbedId
      ? buildYouTubeEmbedUrl(activeChannel.youtubeEmbedId, false)
      : null;

  return (
    <div className="max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12 py-8 pb-20 space-y-8">
      {/* Header & Mode Switch */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">Live TV, Events &amp; Broadcast Studio</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Watch 24/7 Live TV channels, attend live premieres, or go live with camera &amp; OBS Studio RTMP ingest
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-[#111218] p-1 rounded-xl border border-white/[0.08]" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'tv'}
            onClick={() => setSubTab('tv')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'tv' ? 'bg-[#E50914] text-white' : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            Live TV Channels
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'events'}
            onClick={() => setSubTab('events')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'events' ? 'bg-[#E50914] text-white' : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Live Events
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'studio'}
            onClick={() => setSubTab('studio')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'studio' ? 'bg-[#E50914] text-white' : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Go Live Studio
          </button>
        </div>
      </div>

      {/* TAB 1: LIVE TV CHANNELS */}
      {subTab === 'tv' && activeChannel && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-6">
            {/* Active Channel Player */}
            <div className="rounded-2xl overflow-hidden bg-black border border-white/10">
              <div className="relative aspect-video">
                {ytEmbed ? (
                  <iframe
                    src={ytEmbed}
                    title={activeChannel.name}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video
                    ref={tvVideoRef}
                    controls
                    muted
                    playsInline
                    poster={activeChannel.bannerUrl}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="p-5 bg-[#111218] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-[#E50914] font-semibold uppercase tracking-wider">
                    Now Playing · {activeChannel.category} · {activeChannel.language}
                  </p>
                  <h2 className="font-display text-xl font-bold text-white mt-0.5">{activeChannel.name}</h2>
                  <p className="text-sm text-zinc-300 mt-0.5">{activeChannel.currentProgram}</p>
                </div>
                <span className="font-mono text-xs text-zinc-400 tabular-nums">
                  {activeChannel.viewerCount.toLocaleString()} live viewers
                </span>
              </div>
            </div>

            {/* Program Schedule */}
            <div className="rounded-2xl bg-[#111218] border border-white/[0.08] p-5 space-y-3">
              <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#D4AF37]" />
                Broadcast Program Guide · {activeChannel.name}
              </h3>
              <div className="divide-y divide-white/[0.06]">
                {activeChannel.scheduleJson.map((slot, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="font-mono text-xs text-[#D4AF37] tabular-nums w-14 shrink-0">{slot.time}</span>
                      <span className="text-zinc-100 truncate">{slot.program}</span>
                    </div>
                    <span className="font-mono text-xs text-zinc-500 tabular-nums shrink-0">{slot.duration}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Channel Switcher */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-lg font-semibold text-white">All Channels</h3>
                <div className="flex items-center gap-1.5">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer ${
                        categoryFilter === cat ? 'bg-white text-black font-semibold' : 'bg-[#111218] text-zinc-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredChannels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSelectedChannelId(ch.id)}
                    className={`flex items-center gap-3.5 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      ch.id === activeChannel.id
                        ? 'bg-[#E50914]/15 border-[#E50914]'
                        : 'bg-[#111218] border-white/[0.08] hover:border-white/25'
                    }`}
                  >
                    <div className="w-20 aspect-video rounded-lg overflow-hidden shrink-0">
                      <MediaImage src={ch.logoUrl} alt={ch.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-semibold text-white truncate">{ch.name}</p>
                      <p className="text-xs text-zinc-400 truncate">{ch.currentProgram}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {ch.category} · {ch.language} · {ch.status.toUpperCase()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            <LiveChatPanel roomId={`channel-${activeChannel.id}`} baseViewers={activeChannel.viewerCount} user={user} />
          </div>
        </div>
      )}

      {/* TAB 2: LIVE EVENTS & PREMIERES */}
      {subTab === 'events' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {events.map((ev) => (
            <div key={ev.id} className="rounded-2xl overflow-hidden bg-[#111218] border border-white/[0.08] flex flex-col">
              <div className="relative aspect-video">
                <MediaImage src={ev.bannerUrl} alt={ev.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                <span className="absolute top-3 left-3 bg-black/80 px-2.5 py-1 rounded text-[11px] font-semibold text-white uppercase">
                  {ev.status === 'live' ? 'Live Now' : ev.startsAt}
                </span>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between gap-5">
                <div className="space-y-2">
                  <p className="text-xs text-[#D4AF37] font-medium">{ev.category}</p>
                  <h2 className="font-display text-xl font-bold text-white">{ev.title}</h2>
                  <p className="text-sm text-zinc-400 leading-relaxed">{ev.description}</p>
                </div>
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
                  <span className="font-mono text-xs text-zinc-400 tabular-nums">
                    {ev.rsvpCount.toLocaleString()} RSVPs
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRsvp(ev.id)}
                      className="rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white px-3.5 py-2 cursor-pointer"
                    >
                      RSVP
                    </button>
                    {ev.status === 'live' && (
                      <button
                        type="button"
                        onClick={() => onPlayEvent(ev)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#E50914] hover:bg-[#c80812] text-xs font-semibold text-white px-3.5 py-2 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Watch
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: OWN LIVE STREAMING STUDIO (GO LIVE) */}
      {subTab === 'studio' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Studio Camera Preview & Controls */}
          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-2xl overflow-hidden bg-black border border-white/10">
              <div className="relative aspect-video bg-[#0a0b0f] flex items-center justify-center">
                <video
                  ref={previewVideoRef}
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${camEnabled ? 'block' : 'hidden'}`}
                />
                {!camEnabled && (
                  <div className="text-center p-8 space-y-2">
                    <Video className="w-10 h-10 text-zinc-600 mx-auto" />
                    <p className="font-display text-base font-semibold text-white">Studio Broadcast Stage</p>
                    <p className="text-xs text-zinc-400 max-w-sm">
                      Enable your browser camera &amp; microphone below, or stream directly from OBS Studio using your secure RTMP ingest credentials.
                    </p>
                  </div>
                )}
                {activeStudioStream && (
                  <span className="absolute top-4 left-4 inline-flex items-center gap-2 bg-[#E50914] text-white text-xs font-semibold px-3 py-1 rounded">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    ON AIR · {activeStudioStream.title}
                  </span>
                )}
              </div>

              <div className="p-4 bg-[#111218] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleLocalMedia(!camEnabled, micEnabled)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                      camEnabled ? 'bg-white text-black' : 'bg-white/10 text-zinc-200 hover:bg-white/15'
                    }`}
                  >
                    {camEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                    {camEnabled ? 'Camera On' : 'Enable Camera'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLocalMedia(camEnabled, !micEnabled)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                      micEnabled ? 'bg-white text-black' : 'bg-white/10 text-zinc-200 hover:bg-white/15'
                    }`}
                  >
                    {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    {micEnabled ? 'Mic On' : 'Enable Mic'}
                  </button>
                </div>

                {activeStudioStream && (
                  <button
                    type="button"
                    onClick={() => handleEndStudioStream(activeStudioStream.id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-semibold text-white cursor-pointer"
                  >
                    <StopCircle className="w-4 h-4" />
                    End Live Stream
                  </button>
                )}
              </div>
            </div>

            {mediaError && (
              <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl px-4 py-3">
                {mediaError}
              </p>
            )}

            {/* OBS Studio / External RTMP Encoder Box */}
            <div className="rounded-2xl bg-[#111218] border border-white/[0.08] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#D4AF37]" />
                  OBS Studio &amp; External RTMP Encoder Setup
                </h3>
                <span className="text-[11px] text-zinc-400">Encrypted Ingest</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <p className="text-zinc-500">RTMP Server URL</p>
                  <p className="font-mono text-zinc-200 bg-[#090a0e] border border-white/10 rounded-lg px-3 py-2 truncate">
                    {activeStudioStream?.rtmpIngestUrl || 'rtmps://ingest.kinostage.live/studio'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-500">Stream Key (Never Exposed in Public APIs)</p>
                  {oneTimeStreamKey ? (
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-[#D4AF37] bg-[#090a0e] border border-[#D4AF37]/30 rounded-lg px-3 py-2 truncate flex-1">
                        {oneTimeStreamKey}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(oneTimeStreamKey).catch(() => {});
                          setCopiedKey(true);
                          window.setTimeout(() => setCopiedKey(false), 2000);
                        }}
                        aria-label="Copy one-time stream key"
                        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                      >
                        {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  ) : (
                    <p className="font-mono text-zinc-400 bg-[#090a0e] border border-white/10 rounded-lg px-3 py-2">
                      {activeStudioStream ? `Protected (${activeStudioStream.streamKeyHint})` : 'Generated securely when you launch a broadcast'}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-zinc-400">
                OBS Settings: Output Mode Simple/Advanced → H.264 4500–6000 kbps · Keyframe Interval 2s · AAC 160 kbps → Transcoded automatically to Adaptive HLS (.m3u8).
              </p>
            </div>
          </div>

          {/* Launch Stream Form & Authorized Recordings */}
          <div className="lg:col-span-5 space-y-5">
            <form
              onSubmit={handleStartStudioStream}
              className="rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-4"
            >
              <h2 className="font-display text-xl font-bold text-white">Start New Live Broadcast</h2>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400" htmlFor="studio-title">
                  Broadcast Title
                </label>
                <input
                  id="studio-title"
                  type="text"
                  required
                  value={streamTitle}
                  onChange={(e) => setStreamTitle(e.target.value)}
                  placeholder="e.g., Live Post-Show Cast Q&A"
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#E50914]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400" htmlFor="studio-category">
                  Category
                </label>
                <select
                  id="studio-category"
                  value={streamCategory}
                  onChange={(e) => setStreamCategory(e.target.value)}
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                >
                  <option value="Premiere Live">Premiere Live</option>
                  <option value="Reality Show Companion">Reality Show Companion</option>
                  <option value="Live Concert">Live Concert</option>
                  <option value="Creator Studio">Creator Studio</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400" htmlFor="studio-desc">
                  Description
                </label>
                <textarea
                  id="studio-desc"
                  rows={3}
                  value={streamDesc}
                  onChange={(e) => setStreamDesc(e.target.value)}
                  placeholder="Tell viewers what this live broadcast covers..."
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#E50914]"
                />
              </div>
              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveRecording}
                  onChange={(e) => setSaveRecording(e.target.checked)}
                  className="accent-[#E50914]"
                />
                Save authorized VOD recording after stream ends
              </label>

              {studioStatusMsg && <p className="text-xs text-[#D4AF37]">{studioStatusMsg}</p>}

              <button
                type="submit"
                className="w-full rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold text-sm py-3 transition-colors cursor-pointer"
              >
                {user ? 'Go Live & Generate Stream Key' : 'Sign In to Go Live'}
              </button>
            </form>

            {/* Recent Broadcasts & Recordings */}
            <div className="rounded-2xl bg-[#111218] border border-white/[0.08] p-5 space-y-3">
              <h3 className="font-display text-base font-semibold text-white">Studio Broadcasts &amp; Saved Recordings</h3>
              <div className="space-y-2.5">
                {studioStreams.slice(0, 5).map((st) => (
                  <div
                    key={st.id}
                    className="rounded-xl bg-[#0a0b0f] border border-white/[0.06] p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{st.title}</p>
                      <p className="text-zinc-400 mt-0.5">
                        {st.hostName} · {st.category} · Key {st.streamKeyHint}
                      </p>
                    </div>
                    <span
                      className={`font-mono uppercase shrink-0 ${
                        st.status === 'live' ? 'text-[#E50914]' : 'text-zinc-400'
                      }`}
                    >
                      {st.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
