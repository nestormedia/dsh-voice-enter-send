/**
 * Enter ends voice dictation.
 *
 * The shipped voice-input control keeps recording until its own Stop button is
 * pressed and then inserts the transcript into the draft. This contribution
 * lets one Enter press end the capture: it clicks that Stop button and leaves
 * the transcript in the composer, so the ordinary Enter gesture still owns
 * sending.
 *
 * It renders nothing and owns one document-level key listener.
 */
window.__ModuleLoader__.load({
  id: 'dsh-voice-enter-send',
  factory() {
    /** The voice activity row rendered by the voice-input control while it is expanded. */
    const ACTIVITY_SELECTOR = '[data-voice-activity]'

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

        ctx.effect(() => {
          document.addEventListener('keydown', onKeyDown, true)
          return () => { document.removeEventListener('keydown', onKeyDown, true) }
        })
      },
    }
  },
})
