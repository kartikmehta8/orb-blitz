/**
 * @file Bubble preference and app lifecycle glue (PLAN.md §7.2, edge cases 5 and 7).
 *
 * The bubble is hidden while the app is in the foreground and shown again when
 * it goes to the background, if the user enabled it. All calls no-op when the
 * native module is missing (iOS, web, Expo Go).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { BubbleOverlay } from '../modules/bubble-overlay';

const ENABLED_KEY = 'bubbleEnabled:v1';

/**
 * Reads the user's "bubble on" preference.
 * @returns True if the user started the bubble and hasn't stopped it from the app.
 */
export async function isBubbleEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
}

/**
 * Persists the user's "bubble on" preference.
 * @param enabled New value.
 * @returns Resolves once stored.
 */
export async function setBubbleEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
}

/**
 * Handles one AppState transition.
 * Active: hide the bubble, and restart the service if an OEM killed it (edge case 5).
 * Background: show the bubble if enabled.
 * @param state New AppState.
 * @returns Resolves when handled.
 */
async function onAppStateChange(state: AppStateStatus): Promise<void> {
  const overlay = BubbleOverlay;
  if (!overlay) return;
  if (state === 'active') {
    overlay.hideBubble();
    if ((await isBubbleEnabled()) && !overlay.isBubbleRunning() && overlay.hasOverlayPermission()) {
      try {
        overlay.startBubble(); // Starts hidden; shown on the next background.
      } catch {
        // Permission revoked between the check and the call (edge case 43); Home shows the red row.
      }
    }
  } else if (state === 'background' && (await isBubbleEnabled()) && AppState.currentState === 'background') {
    // Re-check after the await so a quick return to the app doesn't leave the bubble over it.
    overlay.showBubble();
  }
}

/**
 * Keeps the bubble in sync with the app's foreground state. Call once in the root layout.
 * @returns Nothing; subscribes for the component's lifetime.
 */
export function useBubbleLifecycle(): void {
  useEffect(() => {
    if (!BubbleOverlay) return;
    void onAppStateChange(AppState.currentState);
    const sub = AppState.addEventListener('change', (state) => void onAppStateChange(state));
    return () => sub.remove();
  }, []);
}
