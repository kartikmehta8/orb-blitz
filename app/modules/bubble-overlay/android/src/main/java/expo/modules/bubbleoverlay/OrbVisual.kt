/**
 * Placeholder tint for the floating orb.
 *
 * Design'er: replace the body of [applyOrbStateVisual]. It is the only
 * function that paints state. States are `idle`, `capturing`, `thinking`,
 * `success`, and `error`. `BubbleService` reverts `success` and `error` to
 * `idle` after 1.5s and cancels that revert when a newer state arrives.
 */
package expo.modules.bubbleoverlay

import android.graphics.PorterDuff
import android.view.View

/**
 * Paints [state] onto the orb disc.
 * @param disc The visible disc inside the overlay window.
 * @param state One of idle, capturing, thinking, success, error.
 */
internal fun applyOrbStateVisual(disc: View, state: String) {
  val color = when (state) {
    "capturing" -> 0xFF3B82F6.toInt()
    "thinking" -> 0xFFF59E0B.toInt()
    "success" -> 0xFF22C55E.toInt()
    "error" -> 0xFFEF4444.toInt()
    else -> 0xFFFFFFFF.toInt()
  }
  val background = disc.background?.mutate() ?: return
  background.setColorFilter(color, PorterDuff.Mode.SRC_ATOP)
  disc.background = background
}
