# sigil

Agent-friendly icon package manager. Manage icons like dependencies: declare
them in a manifest, and codegen is a pure projection of it.

```sh
sigil sources '{}'                        # list supported libraries/sources
sigil use "{ sets: ['lucide', 'svgl'] }"  # declare libraries + vendor locally
sigil search "{ query: 'house' }"          # scoped to declared libraries, offline
sigil search "{ query: 'github', set: '*' }"   # global discovery via Iconify
sigil add "{ refs: ['lucide/house', 'lucide/menu', 'svgl/github'] }"
sigil etch "{ output: 'public/icons.css', format: 'css' }"  # standalone HTML / file://
sigil etch "{ output: 'src/icons.tsx', jsx: 'react' }"      # component module
sigil etch "{ output: 'src/icons', jsx: 'react', modules: true }"  # one module per icon + barrel
sigil etch "{ output: 'src/icons.tsx', jsx: 'react', atlas: true }"
sigil etch "{ output: 'src/icons', jsx: 'octane', atlas: true }"  # .tsrx + atlas
sigil etch "{ output: 'src/icons', jsx: 'tsrx', atlas: true }"
sigil etch "{ output: 'src/icons', jsx: 'tsrx' }"  # Ripple TSRX
sigil etch "{ output: 'design/icons.tsx', jsx: 'pencil' }"  # pen.dev design
sigil etch "{ output: 'lib/src/icons.dart', format: 'dart', atlas: true }"  # Flutter
sigil etch "{ output: 'public/svg' }"               # one .svg per icon
```

`jsx` targets: `react`, `solid`, `octane`
([Octane](https://github.com/octanejs/octane)), and `tsrx`
([Ripple](https://tsrx.dev)). Octane and Ripple both emit `.tsrx`, but use
different framework types, SVG attribute conventions, and atlas state APIs, so
they remain explicit targets. `pencil` emits
[pencil](https://github.com/celados/pencil) Path nodes, so a pen.dev design
written as TSX shares the app's `icons.json`. Without `jsx`, etch dumps one `.svg` file per
icon. Add `atlas: true` with any `jsx` target to generate a sidecar preview module
(`icons.atlas.tsx` or `icons.atlas.tsrx`) that exports a searchable `IconAtlas`
component.

`modules: true` (`react` and `solid`) emits a directory instead of one file:
`index.ts` (a barrel of pure re-exports), `_shell.tsx` (shared `Icon` wrapper
and `IconProps`) one `<icon>.tsx` per icon and a `package.json` (`sideEffects: false`, scoped to the directory so a bundler does not keep every re-exported icon in each chunk that imports the barrel). A bundler keeps a single
`icons.tsx` whole in one chunk, so every icon used anywhere in an app lands in
the first page's chunk; per-icon modules let each icon ship with the chunk that
uses it. Imports from the directory are unchanged (`import { IconHouse } from
'./icons'`), and re-etching deletes generated files for icons no longer in the
manifest.

## Flutter (`format: 'dart'`)

`format: 'dart'` emits one Dart library, so a Flutter app shares the web app's
`icons.json` and icon names. Etch converts every shape to `Path` commands
(`moveTo`, `lineTo`, `cubicTo`, `arcToPoint`…) ahead of time: the app parses no
SVG and imports nothing but `package:flutter/widgets.dart` (no `flutter_svg`,
no Material).

```dart
import 'icons.dart';

SigilIcon(iconHome)                        // IconTheme size, text color
SigilIcon(iconHome, size: 16, strokeWidth: 1.5)
SigilIcon(iconGithub, color: const Color(0xFF111827), semanticLabel: 'GitHub')
```

- Each icon is a `const` `SigilIconData` named after the web component
  (`IconHome` → `iconHome`): its viewBox, its own stroke width, and a paint tree
  of shapes with fill/stroke, linecap/linejoin and per-shape stroke widths.
  Paths are built once and cached.
- `color` replaces `currentColor` and defaults to the ambient text color
  (`DefaultTextStyle`), then `IconTheme`. `strokeWidth` (viewBox units)
  replaces the icon's own width for every stroke that inherits it, like
  `stroke-width` on the web's `<svg>`: animate it for a hover cue.
- Colors follow the CSS rule: `mask` sets paint everything in `color` at each
  paint's own alpha; full-color sets (`svgl`) keep their authored colors,
  linear and radial gradients, clip paths, masks, transforms and opacity.
  Anything Flutter's widgets layer cannot draw (`<style>` rules, filters other
  than one Gaussian blur, `<text>`) fails the etch with the icon and the reason.
- `SigilIconPainter` and `paintSigilIcon(canvas, size, icon, color:,
  strokeWidth:)` draw an icon inside your own painter, for example one that
  repaints from a `Listenable` without a rebuild.
- `atlas: true` adds `icons.atlas.dart` with `sigilIconAtlasItems` and a
  searchable `SigilIconAtlas` grid; `onSelect` receives the tapped item (copy
  `item.ref` to the clipboard there).
- `modules: true` writes a directory instead: `_shell.dart`, one library per
  icon and an `index.dart` barrel. Dart's tree shaking already drops unused
  constants from a single file, so this is a layout preference, not a size win.

Generated files start with `// dart format off`, so a project's formatter
leaves them as etched.

## CSS (`format: 'css'`)

`format: 'css'` emits one self-contained stylesheet for standalone HTML,
including documents opened directly through `file://`:

```html
<link rel="stylesheet" href="./icons.css" />
<span class="sigil sigil-house" aria-hidden="true"></span>

<button aria-label="Home">
	<span class="sigil sigil-house" aria-hidden="true"></span>
</button>
```

Monochrome and duotone icons render as `currentColor` masks; full-color sources
render as authored-color background images. The stylesheet embeds every SVG as
a data URL, so it loads no external SVG, font, script, or runtime dependency.

## Install

Install the latest release:

```sh
curl -fsSL https://raw.githubusercontent.com/celados/sigil/main/install.sh | bash
```

The installer downloads the executable JS bundle from GitHub Releases to
`~/.local/bin/sigil`. Set `SIGIL_INSTALL_DIR` to choose another directory, or
`--version <tag>` to pin a release.

Requirements: [Bun](https://bun.sh) (the bundle runs on the Bun runtime) and
`git` (used to vendor icon libraries on `use`).

Or run from source with Bun:

```sh
bun add github:celados/sigil   # then `bunx sigil ...`
```

## How it works

- **use → search → add → etch**, modeled on a package manager: declare which
  libraries the project uses, then work inside them.
- `use` blobless-sparse-clones each icon set into a user-level cache
  (`$XDG_CACHE_HOME/sigil/icons/<set>/`, default `~/.cache/sigil/icons/`), then
  every later command runs against local files — fast, offline, and able to
  find icons the hosted search index hides. The cache is shared across all
  projects, refreshes automatically after a day, and never touches your
  project directory.
- `etch` is a deterministic, atomic projection of `icons.json`: any missing icon
  fails the whole run without writing a file.
- Component names are app-level, not library-level: always `Icon` + `as` or
  PascalCase(name) (`IconHouse` whether it comes from Lucide or Phosphor, any
  weight). Switching a variant or swapping a library is a manifest change with
  zero import churn; pin a renamed icon with `as` (`tabler/home` as `House`).

Run `sigil sources` to see the supported sources. Bundled adapters are
`heroicons`, `lucide`, `ph`, `simple-icons`, `svgl`, `tabler`, and `untitled-ui`; any other set
falls back to the Iconify API with identical naming, so refs stay portable.
`sigil use '{}'` prints the same source list for quick discovery.

## Icon refs

Refs are explicit `set/name` strings. List them as array elements; there is no
separator DSL:

```sh
sigil add "{ refs: ['lucide/a', 'lucide/b', 'mdi/c'] }"
```

Commands return structured YAML. Pass a non-default manifest with
`--context "{ manifest: 'path/to/icons.json' }"`.

## Manifest (`icons.json`)

Grouped by set; `variant` and `cssMode` are set-level design decisions:

```jsonc
{
	"ph": { "variant": "duotone", "icons": ["house", "airplane-taxiing"] },
	"lucide": { "icons": ["house", { "name": "menu", "as": "Hamburger" }] },
	"private-icons": { "cssMode": "image", "icons": ["logo"] },
}
```

Bundled adapters declare a safe CSS default (`mask` for monochrome sets,
`image` for `svgl`). Long-tail or private sets require an explicit `cssMode`
when Sigil cannot infer their color model without guessing.

Generated components put fill/stroke semantics on the root `<svg>` and accept
`size`, `strokeWidth`, and `class`/`className`, so CSS such as
`svg { stroke-width: 2 }` on hover really changes the line width.

## Semantic presets

```sh
sigil preset "{ name: 'ff', set: 'lucide' }"   # IconChevronRight, IconSearch, …
sigil preset "{ name: 'ff', set: 'tabler' }"   # same names, Tabler glyphs
```

`ff` mirrors [Fluid Functionalism](https://github.com/mickadesign/fluid-functionalism)'s
59 icon slots for `lucide`, `tabler`, `ph`, `hugeicons`, and `untitled-ui`.
Untitled UI's free set forbids redistribution: fine inside your app, not inside
a published library.

See [docs/design.md](./docs/design.md) for the full design.

## Agent skill

A single [`SKILL.md`](./skills/sigil/SKILL.md) teaches coding agents the
library-first workflow. Install it with the [skill](https://github.com/ethan-huo/skill)
manager:

```sh
skill add celados/sigil
```

## Develop

```sh
bun install
bun test                  # SIGIL_E2E=1 bun test runs real vendor clones
bun run check             # typecheck + test + format
```

Built on [argc](https://github.com/ethan-huo/argc) (schema-first CLI) and
[`@iconify/utils`](https://iconify.design/docs/libraries/utils/).
