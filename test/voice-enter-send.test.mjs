/**
 * Headless harness for ../client.js.
 *
 * Simulates the module loader, the plugin context, the voice activity row and
 * key events, so the gesture can be verified without a browser.
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

function makeEnv() {
  const listeners = new Set()
  const document = {
    querySelector(selector) { return selector === '[data-voice-activity]' ? env.row : null },
    addEventListener(type, handler) { if (type === 'keydown') listeners.add(handler) },
    removeEventListener(type, handler) { listeners.delete(handler) },
  }
  const disposers = []
  const env = {
    row: null,
    listeners,
    disposers,
    key(key, extra = {}) {
      const event = {
        key, code: key, keyCode: key === 'Enter' ? 13 : 0, which: 0,
        shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
        isComposing: false, defaultPrevented: false, immediate: false,
        preventDefault() { this.defaultPrevented = true },
        stopImmediatePropagation() { this.immediate = true },
        ...extra,
      }
      for (const handler of [...listeners]) handler(event)
      return event
    },
  }
  return { env, document }
}

function loadPlugin(env, document) {
  let definition
  const window = { __ModuleLoader__: { load(def) { definition = def } } }
  const sandbox = { window, document, console, setTimeout, clearTimeout, Date }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  if (!definition) throw new Error('module not registered')
  if (definition.id !== 'dsh-voice-enter-send') throw new Error(`unexpected module id ${definition.id}`)
  const plugin = definition.factory(() => { throw new Error('client must not require modules') })
  plugin.apply({
    effect(install) {
      const dispose = install()
      if (typeof dispose === 'function') env.disposers.push(dispose)
    },
  })
  return plugin
}

function fresh() {
  const { env, document } = makeEnv()
  const plugin = loadPlugin(env, document)
  return { env, plugin }
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

// 8. Disposal removes the listener.
{
  const { env } = fresh()
  const row = new FakeRow('recording')
  env.row = row
  env.disposers.forEach(dispose => dispose())
  const event = env.key('Enter')
  check('disposed: listener removed', event.defaultPrevented === false && row.stop.clicks === 0)
  check('disposed: no listeners left', env.listeners.size === 0, `n=${env.listeners.size}`)
}

// 9. The plugin renders nothing: only the key listener is installed.
{
  const { env } = fresh()
  check('only one document listener', env.listeners.size === 1, `n=${env.listeners.size}`)
}

console.log(failures === 0 ? 'ALL PASS' : `FAILURES=${failures}`)
process.exitCode = failures === 0 ? 0 : 1
