/**
 * Voice dictation helpers for DeepSeek Harness.
 *
 * 1. Enter ends the capture. The shipped voice-input control keeps recording
 *    until its own Stop button is pressed and then inserts the transcript into
 *    the draft. One Enter press here clicks that Stop button, so the ordinary
 *    Enter gesture still owns sending.
 * 2. Dictation survives a focus change. The same control cancels the capture
 *    on `window.blur` and on a hidden page, which discards everything spoken.
 *    While a capture is live, those two events are swallowed before the
 *    control sees them, so switching windows no longer loses the recording.
 *
 * It renders nothing and owns one key listener plus the two capture guards.
 */
window.__ModuleLoader__.load({
  id: 'dsh-voice-enter-send',
  factory() {
    /** The voice activity row rendered by the voice-input control while it is expanded. */
    const ACTIVITY_SELECTOR = '[data-voice-activity]'

    /** Phases in which the control holds microphone capture that focus loss would discard. */
    const HOLDING_PHASES = new Set(['requesting', 'recording'])

    /** @returns {Element | null} the expanded voice control, or null when dictation is not active. */
    function activityRow() {
      return document.querySelector(ACTIVITY_SELECTOR)
    }

    /** @returns {string | null} the activity phase: requesting, recording, transcribing or feedback. */
    function activityPhase(element) {
      return element.getAttribute('data-voice-activity')
    }

    /** @returns {Element | null} the phase's primary action button (Stop while recording). */
    function primaryButton(element) {
      const buttons = element.querySelectorAll('button')
      return buttons.length === 0 ? null : buttons[buttons.length - 1]
    }

    /** @returns whether the voice control currently holds a capture worth protecting. */
    function holdingCapture() {
      const row = activityRow()
      return row !== null && HOLDING_PHASES.has(activityPhase(row))
    }

    return {
      apply(ctx) {
        const onKeyDown = (event) => {
          if (event.key !== 'Enter') return
          if (event.isComposing || event.keyCode === 229) return
          if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
          const row = activityRow()
          if (row === null) return
          const phase = activityPhase(row)
          if (phase === 'recording') {
            const stop = primaryButton(row)
            if (stop === null) return
            // Stop the capture instead of submitting the draft; Enter then
            // belongs to the composer once the transcript has landed.
            event.preventDefault()
            event.stopImmediatePropagation()
            stop.click()
            return
          }
          if (phase === 'transcribing') {
            // The draft does not hold the transcript yet: a submit here would
            // send stale text. Swallow the press and let the user retry after
            // the insertion.
            event.preventDefault()
            event.stopImmediatePropagation()
          }
        }

        // Keep a live capture from being cancelled when the window loses focus
        // or the page is hidden. Registered before the voice control mounts, so
        // this listener runs first and the control's own cancel never executes.
        const keepCapture = (event) => {
          if (holdingCapture()) event.stopImmediatePropagation()
        }

        ctx.effect(() => {
          document.addEventListener('keydown', onKeyDown, true)
          window.addEventListener('blur', keepCapture, true)
          document.addEventListener('visibilitychange', keepCapture, true)
          return () => {
            document.removeEventListener('keydown', onKeyDown, true)
            window.removeEventListener('blur', keepCapture, true)
            document.removeEventListener('visibilitychange', keepCapture, true)
          }
        })
      },
    }
  },
})
