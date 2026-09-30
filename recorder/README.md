# recorder

A universal event recorder for any web page. One file, no dependencies: [recorder.js](recorder.js). It will also be the content script of the Chrome extension.

```html
<script src="recorder.js"></script>
<script>
  Recorder.start({ actor: { id: 'marie', role: 'senior' } }); // begins one job (case)
  // ...the user does the job...
  const events = Recorder.stop();                            // ends it, returns the events
</script>
```

## Record button

Add [recorder-ui.js](recorder-ui.js) after it to get a floating record button at the bottom right:

```html
<script src="recorder.js"></script>
<script src="recorder-ui.js"></script>
```

Press record to start and stop to end. The recording then opens as a chat: your actions on the right, the page's responses on the left, failures in red. Recordings are saved in `localStorage` (`tectonic.recordings`). The window lists all of them and can download one as JSONL. Clicks on the widget itself are not recorded.

## Options

| Option          | Default | |
| --------------- | ------- | --- |
| `actor`         | `null`  | Who is doing the job, e.g. `{ id, role }`. Copied onto every event. |
| `captureValues` | `false` | Record typed values. When off, only `filled` and `length` are recorded. Fields inside `[data-track-capture]` are always captured. Passwords and card fields are never captured. |
| `onEvent`       | none    | Called with each event as it happens, e.g. to stream events to a server. |

## Event

```json
{ "schema": "tectonic.recorder/v1", "case_id": "…", "seq": 6, "time": "2026-09-30T19:02:11.412Z",
  "actor": { "id": "marie", "role": "senior" }, "type": "change", "url": "https://app.example/employees/E-1",
  "target": { "key": "new-iban", "tag": "input", "type": null, "text": "New IBAN", "path": "form > label > input" },
  "data": { "filled": true, "length": 16 } }
```

`target.key` is the first of `data-track`, `id` and `name`. URLs never include the query string.

| `type`                          | `data` |
| ------------------------------- | ------ |
| `start` / `stop`                | page title, referrer, language, viewport, user agent / total `ms` |
| `page_view`                     | `title`, `from`. In-app route changes (history API, hash) |
| `page_hide` / `page_show`       | `ms` visible before hiding |
| `click`                         | none |
| `change`                        | value (masked), `checked`, or `files` |
| `focus` / `blur`                | `ms` spent in the field (on blur) |
| `paste` / `copy`                | text (masked) |
| `submit`                        | `fields`: `[{ key, filled }]` |
| `invalid`                       | browser validation `message` |
| `key`                           | `key`: only Enter, Escape, Tab |
| `scroll`                        | `depth`: 25, 50, 75, 100 |
| `dialog_open` / `dialog_close`  | none. `<dialog>`, `role="dialog"` and `role="alertdialog"` |
| `request`                       | `method`, `url`, `status` (0 = network error), `ms`. fetch and XHR; no bodies |
| `error`                         | `message`, `source`, `line` |

## Limits

- Recording lives on one page. A full page load ends it. The extension will carry a recording across page loads.
- Only document scrolling is tracked, not scrolling inside inner panels.
- `fetch`, XHR and `history` are wrapped while recording and restored on `stop()`.
