import { motion } from 'motion/react';

export function BrandLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const iconSize = size === 'lg' ? 40 : size === 'sm' ? 22 : 26;
  const textClass =
    size === 'lg'
      ? 'text-3xl tracking-tight'
      : size === 'sm'
        ? 'text-base tracking-tight'
        : 'text-xl tracking-tight';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="2" y="2" width="32" height="32" rx="8" fill="#14151B" stroke="#E50914" strokeWidth="1.75" />
        <path
          d="M14.5 11.2L25 18L14.5 24.8V11.2Z"
          fill="#E50914"
        />
        <path
          d="M11 11.5V24.5"
          stroke="#D4AF37"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      <span className={`font-display font-bold text-white ${textClass}`}>
        Kino<span className="text-[#E50914]">Stage</span>
      </span>
    </span>
  );
}

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: 1.15, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      onAnimationComplete={onComplete}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070709]"
      role="status"
      aria-label="Loading KinoStage Cinema"
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center gap-5"
      >
        <BrandLogo size="lg" />
        <div className="h-[2px] w-44 overflow-hidden rounded-full bg-white/10">
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '0%' }}
            transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-full bg-gradient-to-r from-[#E50914] via-[#D4AF37] to-[#E50914]"
          />
        </div>
        <p className="text-xs tracking-[0.22em] uppercase text-zinc-400">
          Cinema · Live TV · 24/7 Reality Stage
        </p>
      </motion.div>
    </motion.div>
  );
}
