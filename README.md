# sigil

Agent-friendly icon package manager. Manage icons like dependencies: declare
them in a manifest, and codegen is a pure projection of it.

```sh
sigil sources                                  # list supported libraries/sources
sigil use lucide svgl                        # declare libraries + vendor locally
sigil search house                           # scoped to declared libraries, offline
sigil search github --all                    # global discovery (200+ sets via Iconify)
sigil add lucide/house+menu,svgl/github      # record in icons.json
sigil etch --output src/icons.tsx --jsx react     # generate a component module
sigil etch --output src/icons.tsx --jsx react --atlas  # also generate src/icons.atlas.tsx
sigil etch --output src/icons --jsx tsrx --atlas        # also generate src/icons.atlas.tsrx
sigil etch --output src/icons --jsx tsrx          # ripple-ts → src/icons.tsrx
sigil etch --output public/svg                    # no --jsx → dump one .svg per icon
```

`--jsx` targets: `react`, `solid`, `tsrx` ([ripple-ts](https://tsrx.dev)). Without
`--jsx`, etch dumps one `.svg` file per icon. Add `--atlas` with `--jsx react`,
`--jsx solid`, or `--jsx tsrx` to generate a sidecar preview module
(`icons.atlas.tsx` or `icons.atlas.tsrx`) that exports a searchable `IconAtlas`
component.

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
- `use` blobless-sparse-clones each icon set into `node_modules/.icons/<set>/`,
  then every later command runs against local files — fast, offline, and able to
  find icons the hosted search index hides. `etch` re-vendors on a fresh
  checkout, like `pnpm install`.
- `etch` is a deterministic, atomic projection of `icons.json`: any missing icon
  fails the whole run without writing a file.
- Component names are stable across variants (`PhHouse` whether weight is
  `regular` or `duotone`), so switching a set's variant is a one-line manifest
  change with zero import churn.

Run `sigil sources` to see the supported sources. Bundled adapters are
`heroicons`, `lucide`, `ph`, `simple-icons`, `svgl`, and `tabler`; any other set
falls back to the Iconify API with identical naming, so refs stay portable.
`sigil use` without arguments prints the same source list for quick discovery.

## Ref DSL

`+` joins icons, `,` (or a space) separates sets:

```sh
sigil add lucide/a+b,mdi/c
```

## Manifest (`icons.json`)

Grouped by set; `variant` and `prefix` are set-level design decisions:

```jsonc
{
	"ph": { "variant": "duotone", "icons": ["house", "airplane-taxiing"] },
	"lucide": { "icons": ["house", { "name": "menu", "as": "Hamburger" }] },
}
```

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
