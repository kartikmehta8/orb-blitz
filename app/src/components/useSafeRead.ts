/**
 * @file Loads a stored value and keeps a thrown failure separate from an
 * empty result, so a read error is never shown as an empty list.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

type ReadState<T> = {
  /** Last successful value. Null before the first success. */
  value: T | null;
  /** The latest read threw. */
  error: boolean;
  /** True only before the first result, success or failure. */
  loading: boolean;
  /** Runs the read again. */
  retry: () => Promise<void>;
};

/**
 * Calls `read` on mount and whenever `watch` changes.
 * A later failure keeps the previous value so the screen can say the refresh
 * failed instead of swapping in an empty state. An older in-flight read cannot
 * overwrite a newer one.
 * @param read Existing fetch. Pass a stable function.
 * @param watch A value that should trigger another read, such as a payment status.
 * @returns The value, error flag, first-load flag and retry.
 */
export function useSafeRead<T>(read: () => Promise<T>, watch: unknown): ReadState<T> {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const retry = useCallback(async () => {
    const call = ++latest.current;
    try {
      const next = await read();
      if (call !== latest.current) return;
      setValue(next);
      setError(false);
    } catch {
      if (call !== latest.current) return;
      setError(true);
    } finally {
      if (call === latest.current) setLoading(false);
    }
  }, [read]);

  useEffect(() => {
    void retry();
  }, [retry, watch]);

  return { value, error, loading, retry };
}
