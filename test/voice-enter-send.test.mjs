/**
 * Headless harness for ../client.js.
 *
 * Simulates the module loader, the plugin context, the voice activity row,
 * key events and the focus events the voice control reacts to, so the gesture
 * can be verified without a browser.
 *
 * Run: node test/voice-enter-send.test.mjs [path/to/client.js]
 */
import fs from 'node:fs'
import vm from 'node:vm'

const CLIENT = process.argv[2] ?? new URL('../client.js', import.meta.url)
const source = fs.readFileSync(CLIENT, 'utf8')

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

class FakeButton {
  constructor(role) { this.role = role; this.clicks = 0 }
  click() { this.clicks++ }
}

class FakeRow {
  constructor(phase) {
    this.phase = phase
    this.cancel = new FakeButton('cancel')
    this.stop = new FakeButton('stop')
  }
  getAttribute(name) { return name === 'data-voice-activity' ? this.phase : null }
  querySelectorAll(selector) { return selector === 'button' ? [this.cancel, this.stop] : [] }
}

/** Dispatch one event through insertion-ordered listeners, honouring stopImmediatePropagation. */
function dispatch(listeners, event) {
  for (const handler of [...listeners]) {
    handler(event)
    if (event.immediate) break
  }
  return event
}

function makeEvent(extra = {}) {
  return {
    key: '', code: '', keyCode: 0, which: 0,
    shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
    isComposing: false, defaultPrevented: false, immediate: false,
    preventDefault() { this.defaultPrevented = true },
    stopImmediatePropagation() { this.immediate = true },
    ...extra,
  }
}

function makeEnv() {
  const documentListeners = new Map()
  const windowListeners = new Map()
  const add = (map, type, handler) => {
    if (!map.has(type)) map.set(type, new Set())
    map.get(type).add(handler)
  }
  const remove = (map, type, handler) => { map.get(type)?.delete(handler) }

  const document = {
    hidden: false,
    querySelector(selector) { return selector === '[data-voice-activity]' ? env.row : null },
    addEventListener(type, handler) { add(documentListeners, type, handler) },
    removeEventListener(type, handler) { remove(documentListeners, type, handler) },
  }
  const window = {
    addEventListener(type, handler) { add(windowListeners, type, handler) },
    removeEventListener(type, handler) { remove(windowListeners, type, handler) },
  }

  const env = {
    row: null,
    document,
    window,
    key(key, extra = {}) {
      return dispatch(documentListeners.get('keydown') ?? new Set(), makeEvent({ key, code: key, keyCode: key === 'Enter' ? 13 : 0, ...extra }))
    },
    blur(extra = {}) {
      return dispatch(windowListeners.get('blur') ?? new Set(), makeEvent({ type: 'blur', ...extra }))
    },
    visibility(hidden, extra = {}) {
      document.hidden = hidden
      return dispatch(documentListeners.get('visibilitychange') ?? new Set(), makeEvent({ type: 'visibilitychange', ...extra }))
    },
    /** Simulate the voice control's own listener, registered after the plugin. */
    lateWindowListener(type, handler) { add(windowListeners, type, handler) },
    lateDocumentListener(type, handler) { add(documentListeners, type, handler) },
    listenerCount(type) {
      return (documentListeners.get(type)?.size ?? 0) + (windowListeners.get(type)?.size ?? 0)
    },
  }
  return { env, document, window }
}

function loadPlugin(env, document, window) {
  let definition
  window.__ModuleLoader__ = { load(def) { definition = def } }
  const sandbox = { window, document, console, setTimeout, clearTimeout, Date }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  if (!definition) throw new Error('module not registered')
  if (definition.id !== 'dsh-voice-enter-send') throw new Error(`unexpected module id ${definition.id}`)
  const plugin = definition.factory(() => { throw new Error('client must not require modules') })
  const disposers = []
  plugin.apply({
    effect(install) {
      const dispose = install()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
  })
  return { plugin, disposers }
}

function fresh() {
  const { env, document, window } = makeEnv()
  const { disposers } = loadPlugin(env, document, window)
  return { env, disposers }
}

// 1. Enter while recording stops the capture and is swallowed.
{
  const { env } = fresh()
  const row = new FakeRow('recording')
  env.row = row
  const event = env.key('Enter')
  check('recording: Enter swallowed', event.defaultPrevented && event.immediate)
  check('recording: Stop clicked once', row.stop.clicks === 1, `clicks=${row.stop.clicks}`)
  check('recording: Cancel untouched', row.cancel.clicks === 0)
}

// 2. Enter while transcribing is swallowed without touching Stop again.
{
  const { env } = fresh()
  const row = new FakeRow('transcribing')
  env.row = row
  const event = env.key('Enter')
  check('transcribing: Enter swallowed', event.defaultPrevented && event.immediate)
  check('transcribing: Stop not clicked', row.stop.clicks === 0)
}

// 3. Enter with no dictation is left to the composer.
{
  const { env } = fresh()
  env.row = null
  const event = env.key('Enter')
  check('idle: Enter untouched', event.defaultPrevented === false && event.immediate === false)
}

// 4. Feedback phase leaves Enter alone as well.
{
  const { env } = fresh()
  env.row = new FakeRow('feedback')
  const event = env.key('Enter')
  check('feedback: Enter untouched', event.defaultPrevented === false)
}

// 5. Modified Enter never stops the capture.
{
  const { env } = fresh()
  const row = new FakeRow('recording')
  env.row = row
  const shift = env.key('Enter', { shiftKey: true })
  const ctrl = env.key('Enter', { ctrlKey: true })
  const alt = env.key('Enter', { altKey: true })
  const meta = env.key('Enter', { metaKey: true })
  check('modified Enter untouched',
    !shift.defaultPrevented && !ctrl.defaultPrevented && !alt.defaultPrevented && !meta.defaultPrevented)
  check('modified Enter does not stop', row.stop.clicks === 0, `clicks=${row.stop.clicks}`)
}

// 6. IME-composing Enter is ignored.
{
  const { env } = fresh()
  const row = new FakeRow('recording')
  env.row = row
  const event = env.key('Enter', { isComposing: true })
  check('composing Enter untouched', event.defaultPrevented === false && row.stop.clicks === 0)
}

// 7. Other keys are ignored.
{
  const { env } = fresh()
  const row = new FakeRow('recording')
  env.row = row
  const event = env.key('Escape')
  check('other keys untouched', event.defaultPrevented === false && row.stop.clicks === 0)
}

// 8. A blur while recording never reaches the voice control's cancelling listener.
{
  const { env } = fresh()
  env.row = new FakeRow('recording')
  let cancelled = false
  env.lateWindowListener('blur', () => { cancelled = true })
  const event = env.blur()
  check('focus loss during recording is swallowed', event.immediate === true)
  check('recording survives a focus loss', cancelled === false)
}

// 9. A hidden page while recording or requesting keeps the capture.
{
  for (const phase of ['recording', 'requesting']) {
    const { env } = fresh()
    env.row = new FakeRow(phase)
    let cancelled = false
    env.lateDocumentListener('visibilitychange', () => { cancelled = true })
    const event = env.visibility(true)
    check(`hidden page during ${phase} is swallowed`, event.immediate === true)
    check(`capture survives a hidden page during ${phase}`, cancelled === false)
  }
}

// 10. Focus events pass through when no capture is held.
{
  for (const phase of [null, 'transcribing', 'feedback']) {
    const { env } = fresh()
    env.row = phase === null ? null : new FakeRow(phase)
    let blurSeen = 0
    let visibilitySeen = 0
    env.lateWindowListener('blur', () => { blurSeen++ })
    env.lateDocumentListener('visibilitychange', () => { visibilitySeen++ })
    const blurEvent = env.blur()
    const visibilityEvent = env.visibility(true)
    const label = phase ?? 'idle'
    check(`${label}: blur passes through`, blurEvent.immediate === false && blurSeen === 1)
    check(`${label}: visibilitychange passes through`, visibilityEvent.immediate === false && visibilitySeen === 1)
  }
}

// 11. Disposal removes every listener.
{
  const { env, disposers } = fresh()
  const row = new FakeRow('recording')
  env.row = row
  disposers.forEach(dispose => dispose())
  const keyEvent = env.key('Enter')
  let blurSeen = false
  env.lateWindowListener('blur', () => { blurSeen = true })
  const blurEvent = env.blur()
  check('disposed: Enter listener removed', keyEvent.defaultPrevented === false && row.stop.clicks === 0)
  check('disposed: blur guard removed', blurEvent.immediate === false && blurSeen === true)
  check('disposed: only the test listener remains',
    env.listenerCount('keydown') === 0 && env.listenerCount('visibilitychange') === 0,
    `keydown=${env.listenerCount('keydown')} visibilitychange=${env.listenerCount('visibilitychange')}`)
}

// 12. The plugin renders nothing: one key listener, one guard per focus event.
{
  const { env } = fresh()
  check('one keydown listener', env.listenerCount('keydown') === 1, `n=${env.listenerCount('keydown')}`)
  check('one visibilitychange guard', env.listenerCount('visibilitychange') === 1, `n=${env.listenerCount('visibilitychange')}`)
}

console.log(failures === 0 ? 'ALL PASS' : `FAILURES=${failures}`)
process.exitCode = failures === 0 ? 0 : 1
