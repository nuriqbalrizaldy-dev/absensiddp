import React, { useRef, useState } from 'react';
import { LogOut } from 'lucide-react';

export type AppMode = 'participant' | 'admin';

interface HeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  isAdminSignedIn: boolean;
  onAdminSignOut?: () => void;
}

export function Header({
  mode,
  onModeChange,
  isAdminSignedIn,
  onAdminSignOut,
}: HeaderProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoClickTracker = useRef<{ count: number; lastMs: number }>({
    count: 0,
    lastMs: 0,
  });

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (mode === 'admin') {
      onModeChange('participant');
      logoClickTracker.current = { count: 0, lastMs: 0 };
      return;
    }

    const now = Date.now();
    const withinWindow = now - logoClickTracker.current.lastMs < 1200;
    const nextCount = withinWindow ? logoClickTracker.current.count + 1 : 1;
    logoClickTracker.current = { count: nextCount, lastMs: now };

    if (nextCount >= 3) {
      logoClickTracker.current = { count: 0, lastMs: 0 };
      onModeChange('admin');
    }
  };

  return (
    <header className="no-print bg-white border-b border-neutral-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Bank Jakarta Brand Logo */}
        <a
          href="#top"
          onClick={handleLogoClick}
          onDoubleClick={(e) => {
            e.preventDefault();
            if (mode === 'participant') {
              logoClickTracker.current = { count: 0, lastMs: 0 };
              onModeChange('admin');
            }
          }}
          aria-label="Bank Jakarta - Halaman Absen Peserta"
          className="shrink-0 flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B] rounded py-1 select-none"
        >
          {logoFailed ? (
            <span className="text-base sm:text-lg font-bold tracking-tight text-neutral-950 whitespace-nowrap">
              Bank Jakarta
            </span>
          ) : (
            <img
              src="/assets/aistudio/Bank_Jakarta.svg_cf38ce24.webp"
              alt="Bank Jakarta"
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="h-7 sm:h-8 w-auto object-contain block"
            />
          )}
        </a>

        {/* Admin controls are only rendered when already inside the Admin route */}
        {mode === 'admin' && (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onModeChange('participant')}
              className="text-xs sm:text-sm font-medium text-neutral-700 hover:text-neutral-950 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B] rounded px-1 py-1"
            >
              Halaman Absen Peserta
            </button>
            {isAdminSignedIn && onAdminSignOut && (
              <button
                type="button"
                onClick={onAdminSignOut}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B]"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                Keluar Admin
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
