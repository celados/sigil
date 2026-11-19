# sigil outputs

Selector: `sigil @schema .etch`.

## Renderers

`react` and `solid` emit `.tsx`; `octane` and Ripple `tsrx` both emit `.tsrx`, but their JSX types and atlas state APIs differ.

## modules: true (code-split apps)

For several routes or lazy chunks, etch `react` or `solid` with `modules: true`. `output` becomes a directory holding `index.ts` (a side-effect-free barrel; import from it as before), `_shell.tsx`, one module per icon and a `package.json` with `sideEffects: false`. Without that flag a bundler keeps every icon in each chunk that imports the barrel. A single-file `icons.tsx` stays whole in one chunk, so every icon used anywhere ships with the first page that imports any; per-icon modules let each icon land in the chunk that uses it. Re-etching removes stale generated files. `modules` cannot combine with `atlas`.

## pencil

`jsx: 'pencil'` emits `@celados/pencil` Path nodes for a pen.dev design folder next to the app. Run it against the app's own `icons.json` so designs and code share icons and component names (`IconHouse size={16} color="#111827"`). Icons Pen cannot draw (gradients, transforms, masks) fail the etch with the reason. No atlas.

## dart (Flutter)

`format: 'dart'` emits a Dart library that imports only `package:flutter/widgets.dart`. Each icon is a `const` named after the web component (`IconHome` → `iconHome`); shapes are Path builders converted at etch time, built once and cached. Draw with `SigilIcon(iconHome, size: 16, color: …, strokeWidth: 1.5, semanticLabel: …)`: `size` defaults to `IconTheme`, `color` replaces currentColor and defaults to the ambient text color, `strokeWidth` replaces the icon's own width on strokes that inherit it (a hover cue animates it). Inside a custom painter use `paintSigilIcon(canvas, size, icon, color: …)` or `SigilIconPainter`.

Colors follow the CSS rule: `mask` sets paint in `color` at each paint's alpha; full-color sets keep authored colors, gradients, clips, masks and transforms. `<style>` rules, filters other than one Gaussian blur and `<text>` fail the etch with the reason. `atlas: true` adds `icons.atlas.dart` (`SigilIconAtlas`, `sigilIconAtlasItems`); `modules: true` writes `_shell.dart`, one library per icon and an `index.dart` barrel. Files carry `// dart format off`; regenerate instead of editing.

## Root presentation contract

Etch hoists `fill`, `stroke`, `stroke-width`, `stroke-linecap` and `stroke-linejoin` from the body to the root `<svg>`; children only inherit, and per-element values that differ (necessary information) stay. CSS on the `<svg>` (`svg { stroke-width: 2 }`, a hover class) therefore overrides line width, and fill-based sets get only their own `fill`. Components accept `size`, `strokeWidth` (defaults to the set's value) and `class`/`className`.
