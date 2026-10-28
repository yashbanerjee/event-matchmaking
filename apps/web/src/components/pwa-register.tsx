'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaRegister() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
      } catch {
        // Registration can fail on insecure origins during local LAN testing.
      }
    };
    void register();

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () =>
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (!installEvent || dismissed) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow)] sm:inset-x-auto sm:right-4 sm:bottom-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Install Event Matchmaking</p>
          <p className="text-xs text-[var(--muted)]">
            Add to your home screen for quick access on phone, tablet, or
            desktop.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDismissed(true)}
          >
            Not now
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              await installEvent.prompt();
              await installEvent.userChoice;
              setInstallEvent(null);
            }}
          >
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
