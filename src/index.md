# sigil — Icon Package Manager

`sigil` manages icons like a package manager: declare the libraries a project
uses, add exact icon refs to `icons.json`, and generate source files. The
manifest is durable state; generated files are projections and should not be
hand-edited.

## Execution Rules

- Start with `sigil @schema`; do not guess command input from memory.
- Pass one quoted object literal, `@payload.json`, or stdin as each command's
  complete input.
- Icon refs are explicit `set/name` strings in arrays. There is no `+`, `,`, or
  `:` ref DSL.
- Default output is YAML for agents. Use `sigil @run ... --json` when a script
  needs strict JSON; progress and diagnostics belong on stderr.
- Override the manifest with `--context "{ manifest: 'path/to/icons.json' }"`.
  The default is `icons.json` in the current directory.
- Treat the manifest and generated files as project-owned source. Sigil only
  writes those files plus its user-level vendor cache.

## Primary Workflow

1. Inspect the project first. Match the existing stack, `icons.json`, renderer,
   and generated output instead of introducing a parallel convention.
2. Discover or declare icon libraries:

   ```bash
   sigil sources '{}'
   sigil use "{ sets: ['lucide', 'svgl'] }"
   sigil use "{ sets: ['ph'], variant: 'duotone' }"
   ```

3. Find exact names. Default search stays within declared libraries and uses
   the local vendor cache:

   ```bash
   sigil search "{ query: 'house' }"
   sigil search "{ query: 'github', set: 'svgl' }"
   sigil search "{ query: 'github', all: true, limit: 20 }"
   ```

4. Add explicit refs. `add` auto-declares an unknown set, but `use` is the
   explicit provisioning path:

   ```bash
   sigil add "{ refs: ['lucide/house', 'lucide/menu', 'svgl/github'] }"
   sigil add "{ refs: ['simple-icons/github'], as: 'GithubBrand' }"
   ```

5. Generate the artifact:

   ```bash
   sigil etch "{ output: 'public/svg' }"
   sigil etch "{ output: 'public/icons.css', format: 'css' }"
   sigil etch "{ output: 'src/components/icons.tsx', jsx: 'react' }"
   sigil etch "{ output: 'src/components', jsx: 'solid' }"
   sigil etch "{ output: 'src/components', jsx: 'octane', atlas: true }"
   sigil etch "{ output: 'src/components', jsx: 'tsrx' }"
   ```

6. Verify concrete setup with `sigil list '{}'` and check that the generated
   file is imported or linked where it is used.

## Choose An Output

- Individual SVG files suit `<img>`, independently addressable images,
  illustration-style icons, animation, and direct SVG DOM control.
- CSS suits standalone HTML, especially documents opened through `file://`.
  Keep decorative icon spans `aria-hidden`; give icon-only controls an accessible
  name on the button or link.
- Framework renderers suit built applications. `react` and `solid` emit `.tsx`;
  `octane` and Ripple `tsrx` both emit `.tsrx`, but they are not interchangeable
  because their JSX types and atlas state APIs differ.

Bundled monochrome sources default to CSS `mask`; `svgl` defaults to `image`.
For a long-tail or private source, set `cssMode` explicitly with `use` or in
`icons.json`. Never guess ambiguous color semantics.

## Manifest Model

`variant`, `prefix`, and `cssMode` are set-level decisions. Icons store base
names, so changing a Phosphor weight remains a one-line manifest change and
component imports stay stable. `as` replaces only the PascalCase name portion;
the library prefix remains.

Use a bare set ref to remove an entire library and a full `set/name` ref to
remove one icon:

```bash
sigil remove "{ refs: ['lucide/house'] }"
sigil remove "{ refs: ['svgl'] }"
```

## Failure Modes

- `missing_upstream` / `icon_not_found`: search the set for the exact base name,
  fix the manifest or ref, then retry.
- `component_collision`: add `as` to one ref or override the set prefix.
- `invalid_ref`: use one canonical `set/name` string per array element.
- `atlas_requires_component_renderer`: set `jsx` to `react`, `solid`, `octane`,
  or `tsrx` when `atlas` is true.
- `conflicting_renderers`: choose either `format: 'css'` or a `jsx` renderer,
  never both.
