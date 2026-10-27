/**
 * @file Small display formatters shared by the tab components.
 */
import { formatMon } from '../intent';

/**
 * MON amount without the unit, for layouts that style the unit separately.
 * @param wei Amount in wei.
 * @param maxDecimals Fractional digits to keep (default 4).
 * @returns e.g. "2", "0.0021" or "<0.0001".
 */
export function monValue(wei: bigint, maxDecimals?: number): string {
  return formatMon(wei, maxDecimals).replace(/ MON$/, '');
}

/**
 * Coarse relative time.
 * @param at Epoch ms.
 * @param now Clock (ms), default now.
 * @returns e.g. "Just now", "5 min ago", "3 h ago", "Yesterday", or a date.
 */
export function timeAgo(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  if (minutes < 48 * 60) return 'Yesterday';
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
