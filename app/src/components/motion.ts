/**
 * @file Short motion helpers for sheets, status and press feedback.
 *
 * 150–250ms, ease-out on the way in, ease-in on the way out. Reduced motion
 * jumps to the finished state so nothing travels.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/** Quint-style ease-out for entrances under 250ms. */
export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
/** Ease-in for something leaving. */
export const easeIn = Easing.bezier(0.55, 0.055, 0.675, 0.19);

export const motion = { press: 150, ui: 220, exit: 180 } as const;

/**
 * Whether the user asked the OS to reduce motion.
 * @returns True when reduced motion is on. False until the OS answers.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduce(value);
      })
      .catch(() => {
        if (alive) setReduce(false);
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduce;
}

/**
 * Moves a sheet progress value between 0 and 1.
 * Reduced motion sets the value and runs `onEnd` immediately.
 * @param progress Native-driver animated value.
 * @param to 1 to enter, 0 to leave.
 * @param reduce Skip the travel.
 * @param onEnd Called once, after the animation finishes or immediately.
 */
export function animateSheet(progress: Animated.Value, to: 0 | 1, reduce: boolean, onEnd?: () => void): () => void {
  progress.stopAnimation();
  if (reduce) {
    progress.setValue(to);
    onEnd?.();
    return () => {};
  }
  const animation = Animated.timing(progress, {
    toValue: to,
    duration: to === 1 ? motion.ui : motion.exit,
    easing: to === 1 ? easeOut : easeIn,
    useNativeDriver: true,
  });
  animation.start(({ finished }) => {
    if (finished) onEnd?.();
  });
  return () => animation.stop();
}
