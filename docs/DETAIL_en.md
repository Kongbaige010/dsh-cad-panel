# Implementation notes

For people who will change the code or debug it. For installation see [INSTALL.md](../INSTALL.md) (Chinese).

## Two halves

The plugin is split into a host half and a client half, and neither blocks the other:

```
lib/index.js    host: authorises the engine with the persistent token at boot and every 5 minutes (all try/catch)
lib/client.js   client: the CAD chip, the right-dock tab, the build watcher, and honest error display
```

The host half **must never throw** — a throwing plugin aborts DSH startup. So every slot registration and
every timer is individually wrapped in `try/catch`, and timers are `unref()`d so they never hold the process.

## The right sidebar is a dock, not a slot

```
register tab type  ctx.sidebarRightTabs.register({ id, kind, multiple, title(), guide: [...] })
render content     ctx.slots.register({ name: "sidebar.right.pane.tab",       key: <id|kind> }, C)
render title       ctx.slots.register({ name: "sidebar.right.pane.tab.title", key: <id|kind> }, C)
open               ctx.sidebarRight.commandTarget(el) → openTabFromTarget(kind, target)
close              ctx.sidebarRight.closeIn(sessionId, tabId)
read snapshot      ctx.sidebarRight.openTabs.getSnapshot()
```

The service may not be injected; always reach it through `ctx.inject([...], scope => ...)`, never access
`ctx.sidebarRight` directly.

## Auto-open trusts exactly one signal: built

| Field | When it changes | Usable as a trigger |
|---|---|---|
| `built` | on a real model rebuild | ✅ the only trustworthy one |
| `opened` | every time a document is opened | ❌ self-feeding: panel opens → timestamp changes → open again → … |
| `preview` | every time a preview is made | ❌ same loop |
| directory mtime | on any read or write | ❌ same loop |

Two more rules: never open when a panel is already open (it steals focus), and **never auto-open on page
load** — the requirement is "open while a CAD task runs", not "open the moment the page loads".

## Engine-side patches (repatch-engine-csp.sh, idempotent)

| # | Location | Purpose |
|---|---|---|
| ① | `http_app.py` CSP `frame-ancestors` ×3 | allow being embedded by DSH |
| ② | `engine_app.py` `_navigation()` accepts `document/iframe/frame` | treat iframe requests as navigation |
| ③ | `engine_app.py` cookie `SameSite=None; Secure; Partitioned` | credentials survive the cross-site hop |
| ④ | `engine_app.py` sticky authorization (12 h, refreshed every 5 min) | no repeated token prompts |
| ⑤ | `http_app.py` new `GET /dsh/current` | lets the panel discover the current document (`id`/`url`/`built`) |
| ⑥ | `http_app.py` injects `dsh-embed-shim` | storage fallback plus an error overlay |

A `cad update` overwrites `http_app.py` / `engine_app.py` and drops all six; just re-run the script. The
security posture is unchanged: the engine still binds `127.0.0.1`, keeps a Host allowlist, and still
answers `403` to requests without credentials.

## Preview pipeline

```
cad run <script>  →  read document id and bounds  →  cad model export (GLB)
                  →  make-preview.py (GLB + three.js → single-file HTML)
                  →  headless Edge screenshot PNG
```

One-shot entry point: `bash preview/refresh-preview.sh <model.py> <output-dir>`.

## Before/after sheet and callouts

`preview/make-diff-sheet.py` puts the two shots side by side and draws the changed features as red circles
using an orthographic projection:

```bash
python preview/make-diff-sheet.py --before a.png --after b.png --out diff.png \
  --half-h <settledCamera.orthographicHalfHeight> \
  --cam-pos x,y,z --cam-target x,y,z --cam-up x,y,z \
  --hole 20,20,8 --hole -20,20,8
```

Two preconditions or the comparison is meaningless: both shots must come from the **identical** camera
(verify `orthographicHalfHeight` matches digit for digit), and you must project in the **already resized**
coordinate space (multiplying by the scale factor a second time throws the circles into a corner).

## Why three.js is inlined as a classic script

Under `file://` browsers refuse to load ES modules (CORS), so a `type="module"` page just shows a blank
screen when double-clicked. Classic scripts with three.js and the geometry inlined give a single offline
file that works. Note also that GLB follows glTF's **Y-up** convention rather than CAD's Z-up, so the camera
keeps the default `up`, and `GridHelper` already lies in the XZ plane.

## The client module id must equal the package name

`window.__ModuleLoader__.load({ id })` must use exactly the `name` from `package.json`. The host looks the
module up **by package name**, so an `id` with any extra suffix is silently not found, not reported and not
rendered — which looks like "installed, but nothing shows up in the UI".
