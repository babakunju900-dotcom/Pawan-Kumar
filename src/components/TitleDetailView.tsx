import { useEffect, useState } from 'react';
import { ArrowLeft, Play, Plus, Check, Star, Film, Flag, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { EpisodeItem, TitleItem, UserProfile } from '../types/ott';
import { formatMinutes } from '../utils/ott';
import { MediaImage } from './MediaImage';
import { TitleCard } from './TitleCard';

interface TitleDetailViewProps {
  titleId: number;
  user: UserProfile | null;
  watchlistIds: number[];
  onBack: () => void;
  onPlayTitle: (title: TitleItem, episode?: EpisodeItem, seasonEpisodes?: EpisodeItem[]) => void;
  onPlayTrailer: (title: TitleItem) => void;
  onToggleWatchlist: (titleId: number) => void;
  onSelectTitle: (title: TitleItem) => void;
  onRequireAuth: () => void;
}

export function TitleDetailView({
  titleId,
  user,
  watchlistIds,
  onBack,
  onPlayTitle,
  onPlayTrailer,
  onToggleWatchlist,
  onSelectTitle,
  onRequireAuth,
}: TitleDetailViewProps) {
  const [title, setTitle] = useState<TitleItem | null>(null);
  const [similar, setSimilar] = useState<TitleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);

  // Review state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Copyright / Rights report state
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportName, setReportName] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSelectedSeasonIdx(0);
    apiFetch<{ title: TitleItem; similar: TitleItem[] }>(`/api/titles/${titleId}`)
      .then((res) => {
        if (!active) return;
        setTitle(res.title);
        setSimilar(res.similar);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load title details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [titleId]);

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!reviewComment.trim() || !title) return;
    setSubmittingReview(true);
    setReviewStatus(null);
    try {
      const res = await apiFetch<{ review: NonNullable<TitleItem['reviews']>[number] }>(
        `/api/titles/${title.id}/reviews`,
        {
          method: 'POST',
          body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
        }
      );
      setTitle((prev) => (prev ? { ...prev, reviews: [res.review, ...(prev.reviews || [])] } : prev));
      setReviewComment('');
      setReviewStatus('Your review has been published.');
    } catch (err) {
      setReviewStatus(err instanceof Error ? err.message : 'Could not publish review.');
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleCopyrightReport(e: React.FormEvent) {
    e.preventDefault();
    if (!title) return;
    setReportFeedback(null);
    try {
      await apiFetch('/api/compliance/report', {
        method: 'POST',
        body: JSON.stringify({
          titleId: title.id,
          titleName: title.title,
          reporterName: reportName,
          reporterEmail: reportEmail,
          details: reportDetails,
        }),
      });
      setReportFeedback('Rights report logged with our Compliance Desk for immediate review.');
      setReportDetails('');
    } catch (err) {
      setReportFeedback(err instanceof Error ? err.message : 'Failed to submit report.');
    }
  }

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12 py-10 space-y-8 animate-pulse">
        <div className="h-[420px] rounded-2xl bg-[#121319]" />
        <div className="h-8 w-80 rounded bg-[#121319]" />
        <div className="h-24 w-full max-w-2xl rounded bg-[#121319]" />
      </div>
    );
  }

  if (error || !title) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <p className="text-red-400 text-sm">{error || 'Title not found.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-white/10 hover:bg-white/20 px-5 py-2.5 text-sm text-white cursor-pointer"
        >
          Return to Catalog
        </button>
      </div>
    );
  }

  const inWatchlist = watchlistIds.includes(title.id);
  const seasons = title.seasons || [];
  const activeSeason = seasons[selectedSeasonIdx];

  return (
    <div className="pb-20">
      {/* Large Cover Backdrop */}
      <section className="relative min-h-[460px] lg:min-h-[540px] flex items-end border-b border-white/[0.08] overflow-hidden">
        <MediaImage
          src={title.backdropUrl}
          alt={title.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070709] via-[#070709]/75 to-black/35" />

        <div className="relative z-10 w-full max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12 py-10">
          <button
            type="button"
            onClick={onBack}
            className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-end">
            <div className="hidden md:block md:col-span-3 lg:col-span-2">
              <div className="aspect-[3/4] rounded-xl overflow-hidden border border-white/15 bg-[#121319] shadow-2xl">
                <MediaImage src={title.posterUrl} alt={`${title.title} poster`} className="w-full h-full object-cover" />
              </div>
            </div>

            <div className="md:col-span-9 lg:col-span-10 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D4AF37]">
                {title.type === 'series' ? 'Web Series' : 'Feature Movie'} · {title.category}
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-bold text-white [text-wrap:balance]">
                {title.title}
              </h1>

              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300 tabular-nums">
                <span className="text-[#D4AF37] font-semibold">{title.rating.toFixed(1)} / 10</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>{title.releaseYear}</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>{formatMinutes(title.durationMinutes)}</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>{title.language}</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>{title.ageRating}</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>{title.genres.join(', ')}</span>
              </div>

              <p className="text-[15px] leading-relaxed text-zinc-300 max-w-3xl">{title.description}</p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (title.type === 'series' && activeSeason?.episodes?.[0]) {
                      onPlayTitle(title, activeSeason.episodes[0], activeSeason.episodes);
                    } else {
                      onPlayTitle(title);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold text-sm px-6 py-3.5 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {title.type === 'series' ? 'Watch Episode 1' : 'Watch Movie'}
                </button>

                {title.trailerYoutubeId && (
                  <button
                    type="button"
                    onClick={() => onPlayTrailer(title)}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-sm px-5 py-3.5 transition-colors cursor-pointer"
                  >
                    <Film className="w-4 h-4" />
                    Watch Trailer
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onToggleWatchlist(title.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-black/50 hover:bg-black/80 border border-white/15 text-zinc-100 font-medium text-sm px-5 py-3.5 transition-colors cursor-pointer"
                >
                  {inWatchlist ? (
                    <>
                      <Check className="w-4 h-4 text-[#D4AF37]" />
                      In Watchlist
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Add to Watchlist
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowReportForm((s) => !s)}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 px-3 py-2 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Report Rights Issue
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12 py-10 space-y-12">
        {/* Credits & Rights Metadata */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-white/[0.08] pb-8 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Director</p>
            <p className="text-zinc-100 font-medium mt-1">{title.director || 'KinoStage Production'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Starring Cast</p>
            <p className="text-zinc-200 mt-1">
              {title.castList.length > 0 ? title.castList.join(', ') : 'Ensemble Cast'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
              Distribution &amp; Rights
            </p>
            <p className="text-zinc-300 mt-1">
              {title.rightsOwner} · {title.rightsType}
            </p>
          </div>
        </section>

        {/* Copyright / Takedown Report Form */}
        {showReportForm && (
          <form
            onSubmit={handleCopyrightReport}
            className="rounded-2xl bg-[#121319] border border-white/10 p-6 space-y-4 max-w-2xl"
          >
            <h2 className="font-display text-lg font-semibold text-white">Submit Copyright or Rights Inquiry</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                required
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="Your full name / organization"
                className="rounded-lg bg-[#0a0b0f] border border-white/10 px-3.5 py-2.5 text-sm text-white"
              />
              <input
                type="email"
                required
                value={reportEmail}
                onChange={(e) => setReportEmail(e.target.value)}
                placeholder="Contact email"
                className="rounded-lg bg-[#0a0b0f] border border-white/10 px-3.5 py-2.5 text-sm text-white"
              />
            </div>
            <textarea
              required
              rows={3}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Describe the copyright ownership or broadcast rights concern..."
              className="w-full rounded-lg bg-[#0a0b0f] border border-white/10 px-3.5 py-2.5 text-sm text-white"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="rounded-lg bg-[#E50914] hover:bg-[#c80812] text-white text-xs font-semibold px-4 py-2.5 cursor-pointer"
              >
                Submit Compliance Notice
              </button>
              {reportFeedback && <p className="text-xs text-zinc-300">{reportFeedback}</p>}
            </div>
          </form>
        )}

        {/* Web Series Seasons & Episodes */}
        {title.type === 'series' && seasons.length > 0 && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-bold text-white">Seasons &amp; Episodes</h2>
              <div className="flex items-center gap-2">
                {seasons.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSeasonIdx(idx)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                      idx === selectedSeasonIdx
                        ? 'bg-[#E50914] text-white'
                        : 'bg-[#121319] text-zinc-300 hover:bg-[#1a1c24] border border-white/10'
                    }`}
                  >
                    Season {s.seasonNumber}
                  </button>
                ))}
              </div>
            </div>

            {activeSeason && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-400">
                  {activeSeason.title} · {activeSeason.releaseYear} · {activeSeason.episodes.length} Episodes
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeSeason.episodes.map((ep) => (
                    <div
                      key={ep.id}
                      className="flex flex-col sm:flex-row gap-4 rounded-xl bg-[#111218] border border-white/[0.08] p-3.5 hover:border-white/20 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onPlayTitle(title, ep, activeSeason.episodes)}
                        className="relative sm:w-44 aspect-video shrink-0 rounded-lg overflow-hidden bg-black cursor-pointer group"
                      >
                        <MediaImage src={ep.posterUrl} alt={ep.title} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/35 group-hover:bg-black/20 flex items-center justify-center">
                          <span className="w-10 h-10 rounded-full bg-[#E50914] text-white flex items-center justify-center">
                            <Play className="w-4 h-4 fill-current" />
                          </span>
                        </div>
                      </button>
                      <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                        <div>
                          <p className="text-xs text-zinc-400 tabular-nums">
                            Episode {ep.episodeNumber} · {ep.durationMinutes} min · Released {ep.releaseDate}
                          </p>
                          <h3 className="font-display text-base font-semibold text-white mt-0.5 truncate">
                            {ep.title}
                          </h3>
                          <p className="text-xs text-zinc-400 line-clamp-2 mt-1">{ep.description}</p>
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => onPlayTitle(title, ep, activeSeason.episodes)}
                            className="text-xs font-semibold text-[#E50914] hover:text-red-400 cursor-pointer"
                          >
                            Play Episode
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Ratings & Reviews */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 border-t border-white/[0.08] pt-8">
          <div className="lg:col-span-5 space-y-4">
            <h2 className="font-display text-2xl font-bold text-white">Audience Reviews</h2>
            <form onSubmit={handleSubmitReview} className="rounded-xl bg-[#111218] border border-white/[0.08] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-200">Rate this title</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      aria-label={`Rate ${star} stars`}
                      className="p-1 cursor-pointer"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          star <= reviewRating ? 'text-[#D4AF37] fill-[#D4AF37]' : 'text-zinc-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={user ? 'Share your thoughts on cinematography, performances, and story...' : 'Sign in to write a verified viewer review...'}
                className="w-full rounded-lg bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#E50914]"
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="rounded-lg bg-[#E50914] hover:bg-[#c80812] disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 cursor-pointer"
                >
                  {user ? (submittingReview ? 'Posting...' : 'Post Review') : 'Sign In to Review'}
                </button>
                {reviewStatus && <p className="text-xs text-zinc-300">{reviewStatus}</p>}
              </div>
            </form>
          </div>

          <div className="lg:col-span-7 space-y-3">
            {(title.reviews || []).length === 0 ? (
              <p className="text-sm text-zinc-500 pt-2">No viewer reviews yet. Be the first to review {title.title}.</p>
            ) : (
              (title.reviews || []).map((rev) => (
                <div key={rev.id} className="rounded-xl bg-[#111218] border border-white/[0.06] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{rev.username}</span>
                    <span className="text-xs font-mono text-[#D4AF37] tabular-nums">{rev.rating} / 5 ★</span>
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{rev.comment}</p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Similar Movies */}
        {similar.length > 0 && (
          <section className="space-y-4 border-t border-white/[0.08] pt-8">
            <h2 className="font-display text-2xl font-bold text-white">Similar Titles</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
              {similar.map((item) => (
                <TitleCard
                  key={item.id}
                  title={item}
                  inWatchlist={watchlistIds.includes(item.id)}
                  onSelect={onSelectTitle}
                  onPlay={(t) => onPlayTitle(t)}
                  onToggleWatchlist={onToggleWatchlist}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
