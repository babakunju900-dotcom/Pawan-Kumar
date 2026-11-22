import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  PictureInPicture2,
  Subtitles,
  Settings,
  SkipForward,
  RotateCcw,
  RotateCw,
  ExternalLink,
} from 'lucide-react';
import { buildYouTubeEmbedUrl, formatDuration } from '../utils/ott';

export interface PlayerMedia {
  titleId?: number;
  episodeId?: number | null;
  title: string;
  subtitle?: string;
  sourceType: 'youtube' | 'hls' | 'dash' | 'direct';
  videoUrl: string;
  youtubeVideoId?: string | null;
  posterUrl?: string;
  initialProgressSeconds?: number;
  isLive?: boolean;
  hasNextEpisode?: boolean;
  nextEpisodeTitle?: string;
}

interface VideoPlayerModalProps {
  media: PlayerMedia;
  onClose: () => void;
  onSaveProgress?: (progressSeconds: number, durationSeconds: number, completed: boolean) => void;
  onNextEpisode?: () => void;
}

export function VideoPlayerModal({
  media,
  onClose,
  onSaveProgress,
  onNextEpisode,
}: VideoPlayerModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [currentTime, setCurrentTime] = useState(media.initialProgressSeconds || 0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [subtitleTrack, setSubtitleTrack] = useState<'Off' | 'English' | 'Hindi' | 'Malayalam'>('Off');
  const [audioTrack, setAudioTrack] = useState<'Original 5.1' | 'Stereo AAC' | 'Dolby Atmos Mix'>('Original 5.1');
  const [qualityLevels, setQualityLevels] = useState<Array<{ index: number; label: string }>>([
    { index: -1, label: 'Auto (ABR)' },
  ]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [showSettings, setShowSettings] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [autoNextCountdown, setAutoNextCountdown] = useState<number | null>(null);

  const isYouTube = media.sourceType === 'youtube';
  const youtubeEmbed = isYouTube
    ? buildYouTubeEmbedUrl(media.youtubeVideoId || media.videoUrl, true)
    : null;

  // Initialize HLS / Direct video source
  useEffect(() => {
    if (isYouTube) return;
    const video = videoRef.current;
    if (!video) return;

    setPlayerError(null);
    let hls: Hls | null = null;

    const handleLoadedMetadata = () => {
      if (!media.isLive && media.initialProgressSeconds && media.initialProgressSeconds > 5 && video.duration > media.initialProgressSeconds) {
        video.currentTime = media.initialProgressSeconds;
      }
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    };

    if (media.videoUrl.includes('.m3u8') && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: Boolean(media.isLive),
      });
      hlsRef.current = hls;
      hls.loadSource(media.videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const levels = data.levels.map((lvl, idx) => ({
          index: idx,
          label: lvl.height ? `${lvl.height}p` : `Level ${idx + 1}`,
        }));
        setQualityLevels([{ index: -1, label: 'Auto (ABR)' }, ...levels]);
        handleLoadedMetadata();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setPlayerError('Stream signal interrupted. Check connection or switch quality.');
        }
      });
    } else {
      video.src = media.videoUrl;
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
  }, [isYouTube, media.videoUrl, media.isLive, media.initialProgressSeconds]);

  // Periodic progress save
  useEffect(() => {
    if (isYouTube || media.isLive || !onSaveProgress) return;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (video && video.currentTime > 5 && Number.isFinite(video.duration) && video.duration > 0) {
        onSaveProgress(
          Math.floor(video.currentTime),
          Math.floor(video.duration),
          video.currentTime >= video.duration * 0.92
        );
      }
    }, 8000);
    return () => window.clearInterval(interval);
  }, [isYouTube, media.isLive, onSaveProgress]);

  // Auto-next countdown for series episodes
  useEffect(() => {
    if (autoNextCountdown === null) return;
    if (autoNextCountdown <= 0 && onNextEpisode) {
      onNextEpisode();
      setAutoNextCountdown(null);
      return;
    }
    const timer = window.setTimeout(() => setAutoNextCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => window.clearTimeout(timer);
  }, [autoNextCountdown, onNextEpisode]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === ' ' && !isYouTube && document.activeElement?.tagName !== 'BUTTON') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function handleClose() {
    const video = videoRef.current;
    if (video && !media.isLive && onSaveProgress && video.currentTime > 3 && Number.isFinite(video.duration)) {
      onSaveProgress(
        Math.floor(video.currentTime),
        Math.floor(video.duration),
        video.currentTime >= video.duration * 0.92
      );
    }
    onClose();
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }

  function seekBy(delta: number) {
    const video = videoRef.current;
    if (!video || media.isLive) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
    setCurrentTime(video.currentTime);
  }

  function handleQualityChange(levelIndex: number) {
    setSelectedQuality(levelIndex);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
  }

  function handlePlaybackRate(rate: number) {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }

  async function togglePiP() {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // Ignore if PiP unsupported in headless browser
    }
  }

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen denial
    }
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${media.title}`}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 bg-gradient-to-b from-black/90 to-transparent z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {media.isLive && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#E50914]">
                <span className="w-2 h-2 rounded-full bg-[#E50914] animate-pulse" />
                Live
              </span>
            )}
            <h2 className="font-display text-lg font-semibold truncate">{media.title}</h2>
          </div>
          {media.subtitle && <p className="text-xs text-zinc-400 truncate mt-0.5">{media.subtitle}</p>}
        </div>

        <button
          type="button"
          onClick={handleClose}
          aria-label="Close video player"
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {isYouTube && youtubeEmbed ? (
          <div className="w-full h-full max-w-6xl mx-auto px-4 pb-6 flex flex-col">
            <iframe
              src={youtubeEmbed}
              title={media.title}
              className="w-full flex-1 rounded-xl border border-white/10 bg-black"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
              <span>Playing via Official YouTube Embedded Player (YouTube API Compliant).</span>
              <a
                href={`https://www.youtube.com/watch?v=${media.youtubeVideoId || ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-zinc-200 hover:text-white underline"
              >
                Watch on YouTube
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              poster={media.posterUrl}
              playsInline
              muted={isMuted}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                if (media.hasNextEpisode && onNextEpisode) {
                  setAutoNextCountdown(6);
                }
              }}
              onClick={togglePlay}
              className="w-full h-full max-h-[82vh] object-contain cursor-pointer"
            />

            {subtitleTrack !== 'Off' && (
              <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded bg-black/80 text-sm text-zinc-100 border border-white/10">
                [{subtitleTrack} Subtitles Active · Adaptive Track]
              </div>
            )}

            {playerError && (
              <div className="absolute inset-x-4 top-6 mx-auto max-w-md rounded-xl bg-red-950/90 border border-red-500/40 px-4 py-3 text-sm text-red-100 text-center">
                {playerError}
              </div>
            )}

            {autoNextCountdown !== null && media.hasNextEpisode && onNextEpisode && (
              <div className="absolute bottom-8 right-8 rounded-xl bg-[#121319]/95 border border-white/15 p-4 max-w-xs shadow-2xl">
                <p className="text-xs text-zinc-400">Up Next in {autoNextCountdown}s</p>
                <p className="font-display font-semibold text-white mt-1 truncate">
                  {media.nextEpisodeTitle || 'Next Episode'}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoNextCountdown(null);
                      onNextEpisode();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#E50914] text-xs font-semibold text-white cursor-pointer"
                  >
                    Play Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoNextCountdown(null)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-xs text-zinc-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cinema Control Bar (for HLS / DASH / Direct streams) */}
      {!isYouTube && (
        <div className="relative px-5 py-4 bg-gradient-to-t from-black via-black/95 to-black/70 border-t border-white/10">
          {!media.isLive && (
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-xs text-zinc-300 tabular-nums w-12">
                {formatDuration(currentTime)}
              </span>
              <input
                type="range"
                aria-label="Seek timeline"
                min={0}
                max={duration || 100}
                step={1}
                value={Math.min(currentTime, duration || 100)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCurrentTime(val);
                  if (videoRef.current) videoRef.current.currentTime = val;
                }}
                className="flex-1 accent-[#E50914] h-1.5 bg-white/20 rounded-lg cursor-pointer"
              />
              <span className="font-mono text-xs text-zinc-400 tabular-nums w-12 text-right">
                {formatDuration(duration)}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#E50914] hover:bg-[#c80812] text-white cursor-pointer"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              {!media.isLive && (
                <>
                  <button
                    type="button"
                    onClick={() => seekBy(-10)}
                    aria-label="Rewind 10 seconds"
                    className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => seekBy(10)}
                    aria-label="Forward 10 seconds"
                    className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 cursor-pointer"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                </>
              )}

              <div className="flex items-center gap-2 ml-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !isMuted;
                    setIsMuted(next);
                    if (videoRef.current) videoRef.current.muted = next;
                  }}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/10 text-zinc-200 cursor-pointer"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  aria-label="Volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    setIsMuted(v === 0);
                    if (videoRef.current) {
                      videoRef.current.volume = v;
                      videoRef.current.muted = v === 0;
                    }
                  }}
                  className="w-20 accent-white h-1 bg-white/25 rounded-lg cursor-pointer hidden sm:block"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {media.hasNextEpisode && onNextEpisode && (
                <button
                  type="button"
                  onClick={onNextEpisode}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white whitespace-nowrap cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                  Next Episode
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const order: Array<'Off' | 'English' | 'Hindi' | 'Malayalam'> = ['Off', 'English', 'Hindi', 'Malayalam'];
                  const next = order[(order.indexOf(subtitleTrack) + 1) % order.length];
                  setSubtitleTrack(next);
                }}
                aria-label="Cycle subtitles"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-zinc-200 whitespace-nowrap cursor-pointer"
              >
                <Subtitles className="w-4 h-4" />
                CC: {subtitleTrack}
              </button>

              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                aria-label="Playback quality, speed, and audio settings"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-zinc-200 whitespace-nowrap cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                {qualityLevels.find((q) => q.index === selectedQuality)?.label || 'Auto'} · {playbackRate}x
              </button>

              <button
                type="button"
                onClick={togglePiP}
                aria-label="Picture in Picture"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 cursor-pointer"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Toggle Fullscreen"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 cursor-pointer"
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Settings Popover */}
          {showSettings && (
            <div className="absolute bottom-20 right-5 w-72 rounded-xl bg-[#121319] border border-white/15 p-4 shadow-2xl space-y-4 z-20">
              <div>
                <p className="text-xs font-semibold text-zinc-300 mb-2">Adaptive Quality (HLS)</p>
                <div className="flex flex-wrap gap-1.5">
                  {qualityLevels.map((q) => (
                    <button
                      key={q.index}
                      type="button"
                      onClick={() => handleQualityChange(q.index)}
                      className={`px-2.5 py-1 rounded text-xs cursor-pointer ${
                        selectedQuality === q.index
                          ? 'bg-[#E50914] text-white font-semibold'
                          : 'bg-white/10 text-zinc-300 hover:bg-white/15'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-zinc-300 mb-2">Playback Speed</p>
                <div className="flex flex-wrap gap-1.5">
                  {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => handlePlaybackRate(rate)}
                      className={`px-2.5 py-1 rounded text-xs tabular-nums cursor-pointer ${
                        playbackRate === rate
                          ? 'bg-[#E50914] text-white font-semibold'
                          : 'bg-white/10 text-zinc-300 hover:bg-white/15'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-zinc-300 mb-2">Audio Track</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['Original 5.1', 'Stereo AAC', 'Dolby Atmos Mix'] as const).map((track) => (
                    <button
                      key={track}
                      type="button"
                      onClick={() => setAudioTrack(track)}
                      className={`px-2.5 py-1 rounded text-xs cursor-pointer ${
                        audioTrack === track
                          ? 'bg-white text-black font-semibold'
                          : 'bg-white/10 text-zinc-300 hover:bg-white/15'
                      }`}
                    >
                      {track}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
