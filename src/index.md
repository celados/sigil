# sigil — Icon Package Manager

Acts on the project in the current directory: declare icon libraries, add exact icon refs to `icons.json`, and etch source files from it. The manifest is durable project-owned state; generated files are projections, never hand-edited. Sigil writes only those two plus its user-level vendor cache. Preflight: `sigil list '{}'`.

Read the section for your task, then only that slice: `sigil @schema .etch`, or several at once with `sigil @schema '.{add,remove}'`. Deeper material: `sigil @skill references/<file>`.

## Everywhere

- Inspect the project first and match its stack, existing `icons.json`, renderer and output instead of adding a parallel convention.
- Icon refs are explicit `set/name` strings in arrays; there is no `+`, `,` or `:` DSL.
- The manifest path defaults to `./icons.json`; override with `--context "{ manifest: 'path/to/icons.json' }"`.
- Output is lossless YAML on stdout (parse with `Bun.YAML.parse`); progress and diagnostics go to stderr.

## Choosing libraries and names — `.{sources,use,search}`

- `use` is the explicit way to provision a set; `add` auto-declares an unknown one. `variant` and `cssMode` are set-level decisions.
- `search` stays within declared libraries (local vendor cache). `set: '*'` is global Iconify discovery.
- Bundled monochrome sources default to CSS `mask`; `svgl` defaults to `image`. For a long-tail or private source set `cssMode` explicitly; don't guess ambiguous color semantics.

## Declaring icons — `.{add,remove,list,preset}`

- Every component is `Icon` + the app name: `as` when set, else PascalCase of the base name. There is no library prefix, so all sets share one namespace (`lucide/house` → `IconHouse`, `.sigil-house`, `house.svg`). When swapping libraries, replace the ref and pin the old name with `as`, so imports never change.
- Icons store base names while `variant` is a set-level field, so changing a Phosphor weight stays a one-line manifest change.
- `preset` fills named slots (`Icon<Slot>`) from one library; re-running with another set swaps them in place. `ff` is Fluid Functionalism's slot set; slots a library lacks borrow a Lucide glyph.
- `untitled-ui` is not open source: its license forbids redistribution and derivative icon libraries. Don't etch it into a published package or UI kit.
- A bare set ref in `remove` drops the whole library; a full `set/name` drops one icon.

## Generating — `.etch`

Pick the output by how the icons are consumed; renderer semantics, `modules` and `pencil`: `sigil @skill references/outputs.md`.

- SVG files: `<img>`, animation, direct SVG DOM. CSS: standalone HTML, including `file://`; keep decorative spans `aria-hidden` and name icon-only controls on the button or link.
- Framework renderers for built apps. `octane` and Ripple `tsrx` both emit `.tsrx` but are not interchangeable.
- Afterwards run `sigil list '{}'` and check the generated file is imported or linked where it is used.

## Failure codes

- `missing_upstream` / `icon_not_found`: search the set for the exact base name, fix the ref, retry.
- `component_collision`: two refs produce the same name; give one an `as`.
- `invalid_ref`: one canonical `set/name` string per array element.
- `atlas_requires_component_renderer`: `atlas` needs `jsx` of `react`, `solid`, `octane` or `tsrx`.
- `modules_unsupported` / `modules_atlas` / `modules_output_is_directory`: `modules` needs `jsx` `react` or `solid`, no `atlas`, a directory output.
- `conflicting_renderers`: `format: 'css'` or a `jsx` renderer, not both.
