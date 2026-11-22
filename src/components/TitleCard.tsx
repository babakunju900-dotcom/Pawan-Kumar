import { Play, Plus, Check } from 'lucide-react';
import type { TitleItem } from '../types/ott';
import { MediaImage } from './MediaImage';

interface TitleCardProps {
  title: TitleItem;
  onSelect: (title: TitleItem) => void;
  onPlay: (title: TitleItem) => void;
  inWatchlist?: boolean;
  onToggleWatchlist?: (titleId: number) => void;
  rank?: number | null;
  progressPct?: number | null;
}

export function TitleCard({
  title,
  onSelect,
  onPlay,
  inWatchlist = false,
  onToggleWatchlist,
  rank,
  progressPct,
}: TitleCardProps) {
  return (
    <article className="group relative flex flex-col shrink-0 w-[178px] sm:w-[205px] lg:w-[220px]">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-[#121319] border border-white/[0.07] transition-transform duration-200 ease-out group-hover:scale-[1.02]">
        <button
          type="button"
          onClick={() => onSelect(title)}
          aria-label={`View details for ${title.title}`}
          className="block w-full h-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914]"
        >
          <MediaImage
            src={title.posterUrl}
            alt={`${title.title} poster`}
            fallbackLabel={title.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
        </button>

        {typeof rank === 'number' && (
          <span
            aria-label={`Rank ${rank}`}
            className="pointer-events-none absolute top-2.5 left-3 font-display text-4xl font-extrabold leading-none text-white/95 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] tabular-nums"
          >
            {rank}
          </span>
        )}

        {title.isPremium && (
          <span className="pointer-events-none absolute top-3 right-3 text-[11px] font-semibold tracking-wider uppercase text-[#D4AF37] bg-black/75 backdrop-blur-sm px-2 py-0.5 rounded">
            VIP
          </span>
        )}

        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onPlay(title)}
            aria-label={`Play ${title.title}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#E50914] hover:bg-[#c80812] text-white text-xs font-semibold px-3 py-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            Play
          </button>

          {onToggleWatchlist && (
            <button
              type="button"
              onClick={() => onToggleWatchlist(title.id)}
              aria-label={inWatchlist ? `Remove ${title.title} from My List` : `Add ${title.title} to My List`}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-black/70 hover:bg-black/90 border border-white/15 text-white transition-colors cursor-pointer"
            >
              {inWatchlist ? <Check className="w-4 h-4 text-[#D4AF37]" /> : <Plus className="w-4 h-4" />}
            </button>
          )}
        </div>

        {typeof progressPct === 'number' && progressPct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <div className="h-full bg-[#E50914]" style={{ width: `${Math.min(100, progressPct)}%` }} />
          </div>
        )}
      </div>

      <div className="mt-2.5 space-y-1 px-0.5">
        <button
          type="button"
          onClick={() => onSelect(title)}
          className="block w-full text-left font-display text-[15px] font-semibold text-zinc-100 hover:text-white truncate transition-colors cursor-pointer"
        >
          {title.title}
        </button>
        <p className="text-xs text-zinc-400 truncate tabular-nums">
          <span>{title.releaseYear}</span>
          <span className="mx-1.5 text-zinc-600" aria-hidden="true">·</span>
          <span>{title.language}</span>
          <span className="mx-1.5 text-zinc-600" aria-hidden="true">·</span>
          <span className="text-[#D4AF37] font-medium">{title.rating.toFixed(1)}</span>
        </p>
        <p className="text-[11px] text-zinc-500 truncate">{title.category}</p>
      </div>
    </article>
  );
}
