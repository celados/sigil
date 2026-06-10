# sigil

Agent-friendly icon package manager. Manage icons like dependencies: declare
them in a manifest, and codegen is a pure projection of it.

```sh
sigil search github                          # search across 200+ icon sets
sigil add lucide/house+menu,simple-icons/github   # vendor + record in icons.json
sigil etch --output src/icons.tsx --jsx react     # generate a component module
sigil etch --output public/svg                    # no --jsx → dump one .svg per icon
```

## How it works

- **search → add → etch**, modeled on a package manager.
- `add` blobless-sparse-clones the icon set into `node_modules/.icons/<set>/`,
  then every later command runs against local files — fast, offline, and able to
  find icons the hosted search index hides.
- `etch` is a deterministic, atomic projection of `icons.json`: any missing icon
  fails the whole run without writing a file.
- Component names are stable across variants (`PhHouse` whether weight is
  `regular` or `duotone`), so switching a set's variant is a one-line manifest
  change with zero import churn.

Bundled adapters: `lucide`, `heroicons`, `tabler`, `ph`, `simple-icons`. Any
other set falls back to the Iconify API with identical naming, so refs stay
portable.

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
  "lucide": { "icons": ["house", { "name": "menu", "as": "Hamburger" }] }
}
```

See [docs/design.md](./docs/design.md) for the full design.

## Develop

```sh
bun install
bun test                  # SIGIL_E2E=1 bun test runs real vendor clones
bun run check             # typecheck + test + format
```

Built on [argc](https://github.com/ethan-huo/argc) (schema-first CLI) and
[`@iconify/utils`](https://iconify.design/docs/libraries/utils/).
