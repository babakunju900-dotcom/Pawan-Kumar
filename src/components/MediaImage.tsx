import { useState } from 'react';
import { Film } from 'lucide-react';
import { isSafeMediaUrl } from '../utils/ott';

interface MediaImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function MediaImage({ src, alt, className = '', fallbackLabel }: MediaImageProps) {
  const [failed, setFailed] = useState(false);
  const validSrc = src && isSafeMediaUrl(src) ? src : null;

  if (!validSrc || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#181922] via-[#101118] to-[#08080c] text-zinc-500 p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Film className="w-7 h-7 mb-2 text-zinc-600" aria-hidden="true" />
        <span className="text-xs font-medium text-zinc-400 line-clamp-2">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={validSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
