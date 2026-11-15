# dsh-voice-enter-send

Two quality-of-life fixes for voice dictation in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):

1. **Enter ends the capture.** Press it while dictating and the recording stops; the transcript lands in the
   composer. Sending stays on the ordinary Enter you press when the text looks right.
2. **Recording survives switching windows.** Leave the app, come back, and the dictation is still running — what you
   said while away is not discarded.

The shipped voice input requires reaching for the Stop button with the mouse, and it cancels the capture the moment
the window loses focus. This browser plugin adds both missing behaviors without touching the voice input itself.

## Requirements

- DeepSeek Harness with the experimental voice input stack —
  `@deepseek-ai/dsh-experimental-voice-input-bundle` (speech service, microphone control, Remote API).
- Any speech provider registered with that stack: the bundled SenseVoice, or a local model such as
  [`dsh-gigaam-stt`](https://github.com/OldSchool686/dsh-gigaam-stt) for Russian.
- Browser microphone access (loopback or HTTPS), as the voice input itself requires.

Tested with DSH `0.2.2-rc.3` in the Windows Desktop app.

## Install

The package is a DSH bundle. Install it with the agent, with Plugin Manager, or from the command line:

| Source | Install target |
| --- | --- |
| GitHub | `github:nestormedia/dsh-voice-enter-send` |
| Local checkout | absolute path to this directory |
| npm (if published) | `dsh-voice-enter-send` |

Then **restart DeepSeek Harness**: the browser bundle is fetched when the page loads, so a running window keeps the
old code until it reloads.

## Behavior

| Gesture | Result |
| --- | --- |
| Enter while recording | Recording stops; the transcript is inserted into the draft; nothing is sent |
| Enter while the transcript is being decoded | Swallowed — the draft does not hold the new text yet, so a submit would send stale content |
| Enter with no dictation | Untouched — the composer sends as usual |
| Shift / Ctrl / Alt / Cmd + Enter | Untouched |
| Enter during IME composition | Untouched |
| Switching windows or hiding the page mid-recording | Recording continues; the transcript is kept |
| Switching windows with no dictation in progress | Untouched — focus events reach the rest of the UI |

Recognition failures are left to the voice input itself: an empty or failed transcript keeps its retry controls and
never triggers a send.

## How it works

The plugin ships no UI. Its browser entry registers three document/window listeners in the capture phase:

1. **Enter.** Locates the expanded voice control through its `data-voice-activity` attribute. In the `recording`
   phase it swallows the key and clicks that control's primary button — the same Stop the mouse presses. In the
   `transcribing` phase it swallows the key and does nothing, letting the transcript land in the draft.
2. **Focus loss.** While the control holds a capture (`requesting` or `recording`), `window.blur` and
   `visibilitychange` are swallowed before the voice control's own cancelling listeners run, so the recording keeps
   going.

The plugin loads at boot, before the composer mounts, which is what puts its listeners ahead of the voice
control's. After the transcription is inserted, the next Enter is an ordinary composer submission handled by DSH.

Configuration lives in `cordis.patch.yml`: the bundle inserts one host row, `voice-enter-send`, whose package
supplies only the browser artifact (`dsh.client`, platform `web`, `immediately`). The host side is an empty
`apply()`.

## Limitations

- **The microphone stays live while the window is unfocused.** This deliberately overrides DSH's protective
  cancel-on-blur: do not leave a recording running if you are not ready for it to hear what happens on the machine.
- The gestures read the internal markup of the voice-input plugin: the `data-voice-activity` attribute and the
  position of its Stop button. A DSH update may change either and silently disable the gestures; dictation itself
  keeps working. If that happens, open an issue with the DSH version.
- Only the composer's voice control is affected; other recorders and shortcuts are untouched.

## Development

No dependencies and no build step; `client.js` is the browser artifact as served.

```bash
node test/voice-enter-send.test.mjs
```

The test simulates the module loader, the plugin context, the voice activity row, key events and the focus events,
and covers: stop on Enter, swallowing while transcribing, protected capture across blur and a hidden page, focus
events passing through when idle, untouched modified/IME Enter, and listener disposal.

To iterate on an installed copy, edit `client.js` and reload the DSH page (or restart the app). Removing the package
from the profile is enough to uninstall; no state is written outside it.

## License

MIT — see [LICENSE](LICENSE).

---

## По-русски

1. **Enter завершает диктовку**: запись останавливается, расшифровка попадает в поле ввода, сообщение **не**
   отправляется. Enter во время расшифровки проглатывается, чтобы не улетел старый черновик.
2. **Переключение окон не прерывает запись**: можно уйти в другое окно и вернуться — надиктованное не пропадёт.
   Штатный голосовой ввод DSH, наоборот, отменяет запись при потере фокуса.

Shift/Ctrl/Alt/Cmd+Enter и Enter без диктовки не затрагиваются. Нужен включённый голосовой ввод DSH
(`@deepseek-ai/dsh-experimental-voice-input-bundle`) и любой провайдер распознавания. После установки
перезапустите DSH — браузерный бандл подхватывается при загрузке страницы.

Важно: пока идёт запись, **микрофон остаётся включённым и при неактивном окне**. Плагин ничего не рисует: он
слушает Enter и события фокуса и нажимает кнопку «Стоп» голосовой панели. Жесты опираются на внутреннюю разметку
штатного голосового ввода (`data-voice-activity` и последняя кнопка панели) — обновление DSH может её изменить,
и тогда жесты перестанут работать, но сама диктовка продолжит работать.
