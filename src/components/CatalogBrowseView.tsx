import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Film } from 'lucide-react';
import type { TitleItem } from '../types/ott';
import { TitleCard } from './TitleCard';

interface CatalogBrowseViewProps {
  mode: 'movies' | 'series' | 'mylist';
  titles: TitleItem[];
  watchlistIds: number[];
  onSelectTitle: (title: TitleItem) => void;
  onPlayTitle: (title: TitleItem) => void;
  onToggleWatchlist: (titleId: number) => void;
  onBrowseAll: () => void;
}

export function CatalogBrowseView({
  mode,
  titles,
  watchlistIds,
  onSelectTitle,
  onPlayTitle,
  onToggleWatchlist,
  onBrowseAll,
}: CatalogBrowseViewProps) {
  const [query, setQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [selectedLanguage, setSelectedLanguage] = useState('All');

  const inWatchlist = useMemo(() => new Set(watchlistIds), [watchlistIds]);

  const baseTitles = useMemo(() => {
    if (mode === 'movies') return titles.filter((t) => t.type === 'movie');
    if (mode === 'series') return titles.filter((t) => t.type === 'series');
    return titles.filter((t) => inWatchlist.has(t.id));
  }, [mode, titles, inWatchlist]);

  const genres = useMemo(() => {
    const set = new Set<string>();
    baseTitles.forEach((t) => t.genres.forEach((g) => set.add(g)));
    return ['All', ...Array.from(set).sort()];
  }, [baseTitles]);

  const languages = useMemo(() => {
    const set = new Set<string>();
    baseTitles.forEach((t) => set.add(t.language));
    return ['All', ...Array.from(set).sort()];
  }, [baseTitles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return baseTitles.filter((t) => {
      if (selectedGenre !== 'All' && !t.genres.includes(selectedGenre)) return false;
      if (selectedLanguage !== 'All' && t.language !== selectedLanguage) return false;
      if (q) {
        const hay = `${t.title} ${t.description} ${t.director} ${t.castList.join(' ')} ${t.genres.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [baseTitles, query, selectedGenre, selectedLanguage]);

  const heading =
    mode === 'movies'
      ? 'Movies Library'
      : mode === 'series'
        ? 'Original Web Series'
        : 'My Watchlist';

  const subtitle =
    mode === 'movies'
      ? 'Theatrical releases, prestige cinema, and official YouTube premieres'
      : mode === 'series'
        ? 'Multi-season original series with episode continuity and auto-next playback'
        : 'Titles saved for your next cinema session';

  return (
    <div className="max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12 py-8 pb-20 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">{heading}</h1>
          <p className="text-sm text-zinc-400 mt-1.5">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, cast, director..."
              aria-label="Search catalog"
              className="w-64 sm:w-72 rounded-xl bg-[#121319] border border-white/10 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#E50914]"
            />
          </div>
          <label className="inline-flex items-center gap-2 rounded-xl bg-[#121319] border border-white/10 px-3 py-2 text-xs text-zinc-300">
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
            <select
              aria-label="Filter by language"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="bg-transparent text-zinc-100 focus:outline-none cursor-pointer"
            >
              {languages.map((lang) => (
                <option key={lang} value={lang} className="bg-[#121319]">
                  {lang === 'All' ? 'All Languages' : lang}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Genre Segmented Filter Bar */}
      {genres.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="Genre filter">
          {genres.map((genre) => (
            <button
              key={genre}
              type="button"
              role="tab"
              aria-selected={selectedGenre === genre}
              onClick={() => setSelectedGenre(genre)}
              className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedGenre === genre
                  ? 'bg-[#E50914] text-white'
                  : 'bg-[#121319] text-zinc-300 hover:bg-[#1a1c24] border border-white/[0.07]'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      )}

      {/* Results Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-[#111218] border border-white/[0.07] p-12 text-center space-y-4">
          <Film className="w-10 h-10 text-zinc-600 mx-auto" />
          <div className="space-y-1">
            <h2 className="font-display text-xl font-semibold text-white">
              {mode === 'mylist' ? 'Your Watchlist is empty' : 'No matching titles found'}
            </h2>
            <p className="text-sm text-zinc-400">
              {mode === 'mylist'
                ? 'Tap the + icon on any movie or web series to save it here.'
                : 'Try adjusting your search keywords, genre, or language filter.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (mode === 'mylist') {
                onBrowseAll();
              } else {
                setQuery('');
                setSelectedGenre('All');
                setSelectedLanguage('All');
              }
            }}
            className="inline-flex items-center rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white text-sm font-semibold px-5 py-2.5 cursor-pointer"
          >
            {mode === 'mylist' ? 'Explore Home Catalog' : 'Reset Filters'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {filtered.map((item) => (
            <div key={item.id} className="flex justify-center">
              <TitleCard
                title={item}
                inWatchlist={inWatchlist.has(item.id)}
                onSelect={onSelectTitle}
                onPlay={onPlayTitle}
                onToggleWatchlist={onToggleWatchlist}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
