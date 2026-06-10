---
name: sigil
description: Add icons to a project with the `sigil` CLI. Use when the user wants an icon (UI glyph or brand/logo) added as source code — SVG files or React/Solid components — from libraries like Lucide, Heroicons, Tabler, Phosphor, Simple Icons, or svgl. Also use when wiring up a project's icon set or regenerating icon components.
---

# sigil — Icon Package Manager

`sigil` manages icons like a package manager: declare which libraries a project
uses, add the icons you need to a manifest (`icons.json`), and generate source
code from it. The generated code is a pure projection of the manifest — never
hand-edit it; change the manifest and regenerate.

Your job is not to expose every command. It is to get the right icons into the
project as source code with the least machinery.

## First Step (REQUIRED)

Inspect the command surface once before using the tool. Do not guess it from
memory:

```bash
sigil --schema
```

## Mental Model: library-first

A project locks onto a small number of libraries — typically one for UI icons
(e.g. `lucide`) and one for brand logos (e.g. `svgl`) — and works inside them.
So the order is **declare libraries first, then work within them**:

```
use  →  search  →  add  →  etch
```

Once libraries are declared, `search`/`add`/`etch` run fully offline against a
local vendored copy. Reach for global discovery (`--all`) only when you don't
yet know which library to use.

## Primary Workflow

1. **Read project context first.** What's the stack (React/Solid)? Is there
   already an `icons.json` and a generated icons file? Match the existing setup
   instead of imposing a new one.

2. **`sigil use <set>...`** — declare the libraries the project needs and vendor
   them locally. Pick by need: `lucide` (clean UI outline icons, a strong
   default), `heroicons`/`tabler`/`ph` (more UI styles), `simple-icons` (brand
   marks, monochrome), `svgl` (brand logos, full color). Set a variant here if
   the library has weights: `sigil use ph --variant duotone`.

3. **`sigil search <query>`** — find the exact icon name. Default scope is the
   declared libraries (local, offline). Use `--set <lib>` to focus one library,
   `--all` only for cross-library discovery before anything is declared.

4. **`sigil add <set>/<name>`** — record icons in the manifest. The ref DSL is
   one rule: **`+` joins icons, `,` (or a space) separates sets** —
   `sigil add lucide/house+menu+gear,svgl/github`. (`add` will auto-declare an
   undeclared library, but `use` is the explicit path.)

5. **`sigil etch --output <path> [--jsx react|solid]`** — generate. This is the
   step that produces usable code:
   - no `--jsx` → dumps one `.svg` file per icon into the directory
   - `--jsx react` / `--jsx solid` → one component module (a path without a code
     extension gets `/icons.tsx` appended)

6. **Verify** when the user asked for concrete setup: run `sigil list` to
   confirm the manifest, and make sure the generated file is imported where it's
   used.

## What You Get

- Component names are `<Prefix><PascalCase(name)>` — `lucide/house` → `LuHouse`,
  `svgl/github` → `SvGithub`. The prefix is per-library, so the same icon name
  across libraries never collides.
- Names are **stable across variants**: switching `ph` from `regular` to
  `duotone` is a one-line manifest change and re-`etch` — component names and
  imports do not change.
- Stroke icons (lucide) and filled icons (simple-icons) keep their own rendering
  semantics; brand logos (svgl) keep their colors. The shared `Icon` shell takes
  a `size` prop and any SVG prop.

## Variants Are Set-Level

A variant (weight/style like `duotone`, `filled`, `20-solid`) is a property of
the library in the manifest, not part of an icon's identity — an app uses one
variant throughout. Set it with `use --variant`, or edit `icons.json`. Use the
icon's plain base name everywhere (`ph/house`, not `ph/house-duotone`). `svgl`
has no variants: its `-dark`/`-light` logos are distinct refs (`svgl/github-dark`).

## Regenerating & Fresh Checkouts

`etch` is deterministic and atomic: re-run it any time to regenerate; if any
icon is missing upstream it fails the whole run without writing a file. The
vendored data lives in `node_modules/.icons/` (gitignored) — on a fresh checkout
`etch` re-vendors automatically, like `pnpm install`. Commit `icons.json` and
the generated output; do not commit the vendor cache.

## Failure Modes

- **`missing upstream: <set>/<name>`** — the icon (or its variant) doesn't exist.
  `sigil search <query> --set <lib>` to find the correct name, then fix the
  manifest or `sigil remove` it.
- **`name collision: ... both produce <Name>`** — two icons map to the same
  component name. Disambiguate in the manifest with `{ "name": "...", "as": "..." }`.
- **`no icons found ... in declared libraries`** — the query matched nothing in
  the declared scope. Retry with `--all` (or `--set` another library).
- **Network error during `use`/`--all`/fallback** — `sigil` hits
  `api.iconify.design` only for global discovery and for libraries without a
  bundled adapter. The bundled libraries (lucide, heroicons, tabler, ph,
  simple-icons, svgl) vendor over git and work offline after `use`.
