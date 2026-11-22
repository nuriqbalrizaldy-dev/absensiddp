import React, { useEffect, useRef, useState } from 'react';
import { AdminView } from './components/AdminView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header, type AppMode } from './components/Header';
import { ParticipantView } from './components/ParticipantView';
import {
  checkIsAdminUser,
  signInAdminWithGoogle,
  signOutAdmin,
  subscribeAuthState,
  subscribeTrainingConfig,
  type AppAuthUser,
} from './services/attendanceService';
import { DEFAULT_TRAINING_CONFIG, type TrainingConfig } from './utils/attendanceLogic';

function getInitialMode(): AppMode {
  if (typeof window === 'undefined') return 'participant';
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.replace(/\/+$/, '');
  if (params.get('mode') === 'admin' || path === '/admin' || window.location.hash === '#admin') {
    return 'admin';
  }
  return 'participant';
}

export default function App() {
  const [mode, setMode] = useState<AppMode>(getInitialMode);
  const [config, setConfig] = useState<TrainingConfig>(DEFAULT_TRAINING_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);

  const [user, setUser] = useState<AppAuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const footerClickTracker = useRef<{ count: number; lastMs: number }>({
    count: 0,
    lastMs: 0,
  });

  useEffect(() => {
    const unsubscribeConfig = subscribeTrainingConfig(
      (nextConfig) => {
        setConfig(nextConfig);
        setConfigLoading(false);
      },
      () => {
        setConfigLoading(false);
      },
    );
    return () => unsubscribeConfig();
  }, []);

  useEffect(() => {
    const unsubscribeAuth = subscribeAuthState(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const adminOk = await checkIsAdminUser(currentUser);
        setIsAdmin(adminOk);
      } else {
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setMode((prev) => {
          const next: AppMode = prev === 'participant' ? 'admin' : 'participant';
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            if (next === 'admin') {
              url.searchParams.set('mode', 'admin');
            } else {
              url.searchParams.delete('mode');
            }
            window.history.replaceState({}, '', url.toString());
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleModeChange = (nextMode: AppMode) => {
    setMode(nextMode);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (nextMode === 'admin') {
        url.searchParams.set('mode', 'admin');
      } else {
        url.searchParams.delete('mode');
        if (url.pathname.replace(/\/+$/, '') === '/admin') {
          url.pathname = '/';
        }
        if (url.hash === '#admin') {
          url.hash = '';
        }
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInAdminWithGoogle();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Gagal masuk dengan Google. Pastikan pop-up tidak diblokir browser.';
      setAuthError(message);
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    await signOutAdmin();
  };

  return (
    <ErrorBoundary>
      <div id="top" className="min-h-screen flex flex-col bg-neutral-50 text-neutral-950">
        <Header
          mode={mode}
          onModeChange={handleModeChange}
          isAdminSignedIn={Boolean(user && isAdmin)}
          onAdminSignOut={handleSignOut}
        />

        <div className="flex-1">
          {mode === 'participant' ? (
            <ParticipantView config={config} configLoading={configLoading} />
          ) : (
            <AdminView
              user={user}
              authLoading={authLoading}
              isAdmin={isAdmin}
              config={config}
              onGoogleSignIn={handleGoogleSignIn}
              onSignOut={handleSignOut}
              authError={authError}
              onBackToParticipant={() => handleModeChange('participant')}
            />
          )}
        </div>

        <footer className="no-print border-t border-neutral-200 bg-white mt-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-2 text-xs text-neutral-500">
            <span
              onDoubleClick={() => handleModeChange('admin')}
              onClick={() => {
                const now = Date.now();
                const withinWindow = now - footerClickTracker.current.lastMs < 1200;
                const nextCount = withinWindow ? footerClickTracker.current.count + 1 : 1;
                footerClickTracker.current = { count: nextCount, lastMs: now };
                if (nextCount >= 3) {
                  footerClickTracker.current = { count: 0, lastMs: 0 };
                  handleModeChange('admin');
                }
              }}
              className="select-none cursor-default"
            >
              Sistem Absensi Digital Pelatihan Karyawan
            </span>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
