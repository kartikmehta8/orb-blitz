/**
 * State paint for the floating orb.
 *
 * [applyOrbStateVisual] is the only function that paints a state. States are
 * `idle`, `capturing`, `thinking`, `success`, and `error`. `BubbleService`
 * reverts `success` and `error` to `idle` after 1.5s and cancels that revert
 * when a newer state arrives. This file does not change that timing.
 */
package expo.modules.bubbleoverlay

import android.animation.Animator
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.provider.Settings
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.LinearInterpolator
import android.widget.ImageView
import kotlin.math.min
import kotlin.math.roundToInt

/** Monad purple. Idle, capturing, and thinking. */
private val ORB_IDLE = 0xFF6E54FF.toInt()

/** Paid. Same green as the app's success text. */
private val ORB_SUCCESS = 0xFF0A7A4E.toInt()

/** Failed. Same red as the app's danger text. */
private val ORB_ERROR = 0xFFB42336.toInt()

/** Static 1dp ring: white at 24% alpha. */
private val ORB_RING = 0x3DFFFFFF.toInt()

/**
 * Paints [state] onto the orb disc.
 * Cancels whatever the previous call started, then sets the fill, the white
 * mark, and the 1dp ring. Motion is skipped when the system animator duration
 * scale is 0.
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

  // Remove animations (duration scale 0): colours and the mark only.
  val durationScale = try {
    Settings.Global.getFloat(disc.context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
  } catch (_: RuntimeException) {
    1f
  }
  if (durationScale == 0f) return

  /**
   * Ring that grows from 1.0 to 1.12 of its inset radius and fades, then repeats.
   * The base is inset so the 1.12 scale still lands inside the disc.
   */
  fun captureRing(): Animator {
    val pulse = object : Drawable() {
      var t = 0f
      private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = strokePx
        color = Color.WHITE
      }

      override fun draw(canvas: Canvas) {
        val b = bounds
        if (b.width() <= 0 || b.height() <= 0) return
        val maxR = min(b.width(), b.height()) / 2f - strokePx / 2f
        if (maxR <= 0f) return
        paint.alpha = ((1f - t) * 255f).roundToInt().coerceIn(0, 255)
        canvas.drawCircle(b.exactCenterX(), b.exactCenterY(), (maxR / 1.12f) * (1f + 0.12f * t), paint)
      }

      override fun setAlpha(alpha: Int) = Unit

      override fun setColorFilter(colorFilter: android.graphics.ColorFilter?) = Unit

      @Suppress("DEPRECATION")
      override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
    }
    disc.foreground = pulse
    return ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 600
      repeatCount = ValueAnimator.INFINITE
      interpolator = LinearInterpolator()
      addUpdateListener { animator ->
        if (!disc.isAttachedToWindow) {
          animator.cancel()
          return@addUpdateListener
        }
        pulse.t = animator.animatedFraction
        pulse.invalidateSelf()
      }
    }
  }

  /** Disc alpha from 1.0 down to 0.85 and back, one breath per 1200ms. */
  fun breath(): Animator = ObjectAnimator.ofFloat(disc, View.ALPHA, 1f, 0.85f, 1f).apply {
    duration = 1200
    repeatCount = ValueAnimator.INFINITE
    interpolator = AccelerateDecelerateInterpolator()
  }

  /** One scale pop, 1.0 → 1.08 → 1.0, over 200ms. */
  fun pop(): Animator = ObjectAnimator.ofPropertyValuesHolder(
    disc,
    PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.08f, 1f),
    PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.08f, 1f),
  ).apply {
    duration = 200
    interpolator = LinearInterpolator()
  }

  /** Three back-and-forth moves of 4dp, then rest, in 240ms. */
  fun shake(): Animator {
    val distance = density * 4f
    return ObjectAnimator.ofFloat(
      disc,
      View.TRANSLATION_X,
      0f,
      distance,
      -distance,
      distance,
      -distance,
      distance,
      -distance,
      0f,
    ).apply {
      duration = 240
      interpolator = LinearInterpolator()
    }
  }

  val started = ArrayList<Animator>()
  when (state) {
    "capturing" -> started.add(captureRing())
    "thinking" -> started.add(breath())
    "success" -> started.add(pop())
    "error" -> started.add(shake())
  }
  if (started.isNotEmpty()) {
    disc.tag = started
    started.forEach { it.start() }
  }
}
