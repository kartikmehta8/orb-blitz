/**
 * State paint for the floating orb.
 *
 * [applyOrbStateVisual] is the only function that paints a state. States are
 * `idle`, `capturing`, `thinking`, `success`, and `error`. `BubbleService`
 * reverts `success` and `error` to `idle` after 1.5s and cancels that revert
 * when a newer state arrives. This file does not change that timing.
 *
 * The orb is still: no pulse, breath, pop or shake. A state is its fill and
 * its mark only (purple with the Orb glyph, green with a check, red with the
 * glyph). Press and drag feedback live in `BubbleService`.
 */
package expo.modules.bubbleoverlay

import android.animation.Animator
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.view.View
import android.widget.ImageView
import kotlin.math.roundToInt

/** Near-black, like the app's primary buttons. Idle, capturing, and thinking. */
private val ORB_IDLE = 0xFF121314.toInt()

/** Paid. Same green as the app's success text. */
private val ORB_SUCCESS = 0xFF0A7A4E.toInt()

/** Failed. Same red as the app's danger text. */
private val ORB_ERROR = 0xFFB42336.toInt()

/** Static 1dp ring: white at 24% alpha. */
private val ORB_RING = 0x3DFFFFFF.toInt()

/**
 * Paints [state] onto the orb disc: the fill, the white mark, and the 1dp ring.
 * Also cancels any animator an older build left on the disc.
 * @param disc The visible disc inside the overlay window.
 * @param state One of idle, capturing, thinking, success, error.
 */
internal fun applyOrbStateVisual(disc: View, state: String) {
  val running = disc.tag as? MutableList<*>
  disc.tag = null
  running?.forEach { (it as? Animator)?.cancel() }
  disc.animate().cancel()
  disc.scaleX = 1f
  disc.scaleY = 1f
  disc.translationX = 0f
  disc.alpha = 1f
  disc.foreground = null

  /** White check, drawn for the success mark. */
  fun whiteCheck(view: View): Drawable {
    val size = (24f * view.resources.displayMetrics.density).roundToInt().coerceAtLeast(24)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    bitmap.density = view.resources.displayMetrics.densityDpi
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      style = Paint.Style.STROKE
      strokeWidth = size * 0.12f
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
    }
    canvas.drawPath(
      Path().apply {
        moveTo(size * 0.22f, size * 0.52f)
        lineTo(size * 0.42f, size * 0.72f)
        lineTo(size * 0.78f, size * 0.32f)
      },
      paint,
    )
    return BitmapDrawable(view.resources, bitmap)
  }

  val density = disc.resources.displayMetrics.density
  val strokePx = density.coerceAtLeast(1f)
  val fill = when (state) {
    "success" -> ORB_SUCCESS
    "error" -> ORB_ERROR
    else -> ORB_IDLE
  }
  val body = GradientDrawable().apply {
    shape = GradientDrawable.OVAL
    setColor(fill)
  }
  val ring = GradientDrawable().apply {
    shape = GradientDrawable.OVAL
    setColor(Color.TRANSPARENT)
    setStroke(strokePx.roundToInt().coerceAtLeast(1), ORB_RING)
  }
  disc.background = LayerDrawable(arrayOf<Drawable>(body, ring))
  disc.backgroundTintList = null

  if (disc is ImageView) {
    disc.clearColorFilter()
    if (state == "success") disc.setImageDrawable(whiteCheck(disc))
    else disc.setImageResource(R.drawable.bubble_icon)
  }
}
