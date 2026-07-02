# AGENTS.md

## Project
The Vision — a collection of webcam-driven interactive experiences using
MediaPipe hand/face tracking, Canvas 2D, and Three.js.

## Stack
- Vanilla HTML/CSS/JS — no bundler, no package.json, no npm scripts.
- ES modules (`type="module"`) for the Light-Nodes game (`js/`).
- Inline `<script>` (non-module or inline `type="module"`) for standalone pages.
- All ML/3D deps loaded via CDN: MediaPipe Hands, MediaPipe Face Landmarker,
  Three.js r150 (import-mapped), es-module-shims.
- Google Fonts "Inter" loaded from fonts.googleapis.com.

## Commands
No build tooling. Serve any way you like (Live Server, `python -m http.server`,
etc.). There are no dev/build/test/lint scripts.

## Conventions
- **JS naming**: camelCase variables and functions, PascalCase classes
  (`HandTracker`, `LightNode`, `NodeManager`, `ParticleSystem`).
- **File naming**: lowercase, no separators for JS (`hands.js`, `renderer.js`);
  kebab-case for standalone HTML pages (`mediapipe-facecap-morph.html`,
  `mesh_debug.html` is an exception using underscore).
- **CSS classes**: kebab-case (`gesture-hint`, `nav-back`, `mode-badge`),
  plus modifier patterns like `.reset-choice.highlight-yes`.
  No BEM, no utility framework.
- **CSS architecture**: `index.html` uses an external `style.css`. All other
  pages embed CSS in `<style>` blocks in the `<head>`.
- **Comments**: section headers use `// ── Section Name ──` in JS and
  `/* ── Section ── */` in CSS. Preserve this style.
- **Commit messages**: short imperative phrases, lowercase
  (e.g. "paint feature", "Initial commit"). Only 2 commits exist.
- **No linter, formatter, or editorconfig configured.**

## Structure
```
index.html            → Light-Nodes game (entry point)
style.css             → Shared stylesheet (only used by index.html)
js/
  main.js             → Bootstrap, gesture processing, game loop
  hands.js            → MediaPipe Hands wrapper (exports HandTracker)
  nodes.js            → LightNode entity + NodeManager (physics, split, bridge)
  particles.js        → Particle pool (trail + blast effects)
  renderer.js         → All Canvas 2D drawing (nodes, tethers, cursors)
visualizer.html       → Hand + Face vein visualizer (Three.js + 2D overlay)
paint.html            → Camera Paint (draw with hand gestures)
mediapipe-facecap-morph.html → Face morph-target debugger (Three.js)
mesh_debug.html       → Face mesh vertex-index inspector
asset/
  skull-reference.svg → Reference artwork (1.4 MB)
```

## Boundaries
- **Do not modify without approval**:
  - `asset/skull-reference.svg` — large vendored reference asset.
  - `mediapipe-facecap-morph.html`, `mesh_debug.html` — standalone debug/test
    pages; treat as reference tools.
- Never pin or vendor CDN libraries locally unless explicitly asked.
- Never add a bundler, framework, or package.json unless explicitly asked.

## Working style
- Before making any change (new file, edit, refactor, dependency, structural
  change), first propose your approach as 2-3 short options with tradeoffs,
  or a single plan if there's only one sensible way.
- Wait for me to pick an option or say "go ahead" before writing/editing
  any files.
- Exception: read-only actions (scanning files, searching, explaining code)
  don't need confirmation.
- If a task is trivial and unambiguous (e.g. fixing an obvious typo I pointed
  out), you may skip the options step but still state what you're about to
  do in one line before doing it.
