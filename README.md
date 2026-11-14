# dsh-voice-enter-send

Press **Enter** while dictating in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and the
recording stops: the transcript appears in the composer and nothing is sent. Sending stays where it belongs — on the
ordinary Enter you press when the text looks right.

The shipped voice input requires reaching for the Stop button with the mouse. This browser plugin adds the missing
gesture: one key press ends the capture, the transcript lands in the draft.

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
| GitHub | `github:<account>/dsh-voice-enter-send` |
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

Recognition failures are left to the voice input itself: an empty or failed transcript keeps its retry controls and
never triggers a send.

## How it works

The plugin ships no UI. Its browser entry registers one document-level `keydown` listener in the capture phase:

1. Locate the expanded voice control through its `data-voice-activity` attribute.
2. In the `recording` phase, swallow the key and click that control's primary button — the same Stop the mouse
   presses.
3. In the `transcribing` phase, swallow the key and do nothing, letting the transcript land in the draft.

After the transcription is inserted, the next Enter is an ordinary composer submission handled by DSH.

Configuration lives in `cordis.patch.yml`: the bundle inserts one host row, `voice-enter-send`, whose package
supplies only the browser artifact (`dsh.client`, platform `web`, `immediately`). The host side is an empty
`apply()`.

## Limitations

- The gesture reads the internal markup of the voice-input plugin: the `data-voice-activity` attribute and the
  position of its Stop button. A DSH update may change either and silently disable the gesture; dictation itself
  keeps working. If that happens, open an issue with the DSH version.
- Only the composer's voice control is affected; other recorders and shortcuts are untouched.
- Nothing is sent automatically by design — that was the point of the change.

## Development

No dependencies and no build step; `client.js` is the browser artifact as served.

```bash
node test/voice-enter-send.test.mjs
```

The test simulates the module loader, the voice activity row and key events, and covers: stop on Enter, swallowing
while transcribing, untouched modified/IME Enter, untouched Enter without dictation, and listener disposal.

To iterate on an installed copy, edit `client.js` and reload the DSH page (or restart the app). Removing the package
from the profile is enough to uninstall; no state is written outside it.

## License

MIT — see [LICENSE](LICENSE).

---

## По-русски

Enter во время голосовой диктовки завершает запись: расшифровка попадает в поле ввода, а сообщение **не**
отправляется. Отправка остаётся обычному Enter. Enter во время расшифровки проглатывается, чтобы не улетел старый
черновик; Shift/Ctrl/Alt/Cmd+Enter и Enter без диктовки не затрагиваются.

Нужен включённый голосовой ввод DSH (`@deepseek-ai/dsh-experimental-voice-input-bundle`) и любой провайдер
распознавания. После установки перезапустите DSH — браузерный бандл подхватывается при загрузке страницы.

Плагин ничего не рисует: он слушает Enter и нажимает кнопку «Стоп» голосовой панели. Жест опирается на внутреннюю
разметку штатного голосового ввода (`data-voice-activity` и последняя кнопка панели) — обновление DSH может её
изменить, и тогда жест перестанет работать, но сама диктовка продолжит работать.
