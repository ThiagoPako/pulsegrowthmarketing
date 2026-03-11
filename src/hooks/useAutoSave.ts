import { useEffect, useRef, useCallback } from 'react';

const AUTOSAVE_INTERVAL = 30_000; // 30 seconds

/**
 * Auto-save hook with localStorage recovery.
 * Saves form data every 30 seconds and on unmount.
 * Recovers data if the user closes the page unexpectedly.
 */
export function useAutoSave<T>(
  key: string,
  data: T,
  options?: {
    enabled?: boolean;
    interval?: number;
    onRecover?: (recovered: T) => void;
  }
) {
  const { enabled = true, interval = AUTOSAVE_INTERVAL, onRecover } = options ?? {};
  const storageKey = `autosave:${key}`;
  const dataRef = useRef(data);
  const recoveredRef = useRef(false);

  dataRef.current = data;

  // Recover on mount
  useEffect(() => {
    if (!enabled || recoveredRef.current) return;
    recoveredRef.current = true;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { data: T; savedAt: number };
        const ageMinutes = (Date.now() - parsed.savedAt) / 60_000;
        // Only recover if saved within last 60 minutes
        if (ageMinutes < 60 && onRecover) {
          onRecover(parsed.data);
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, enabled, onRecover]);

  // Save periodically
  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ data: dataRef.current, savedAt: Date.now() })
        );
      } catch {
        // Storage full or unavailable
      }
    }, interval);

    return () => clearInterval(timer);
  }, [storageKey, enabled, interval]);

  // Save on unmount
  useEffect(() => {
    if (!enabled) return;
    return () => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ data: dataRef.current, savedAt: Date.now() })
        );
      } catch {
        // ignore
      }
    };
  }, [storageKey, enabled]);

  const clearSaved = useCallback(() => {
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { clearSaved };
}
