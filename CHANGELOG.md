# Changelog

## 0.5.0

### Breaking

- Generated components carry fill/stroke semantics as root `<svg>` attributes
  instead of an inner `<g>` or per-path attributes. Children only inherit, so
  CSS on the `<svg>` (e.g. `stroke-width: 2` on hover) now takes effect. The
  CSS and per-file SVG outputs carry the same root attributes.
- Solid, Octane, and Ripple components accept `strokeWidth` (React already
  did through `SVGProps`); it defaults to the icon set's own width.

### Added

- `sigil preset`: fill named semantic slots from one library; re-running with
  another set swaps every slot in place. Ships `ff`, Fluid Functionalism's 59
  icon slots, for `lucide`, `tabler`, `ph`, `hugeicons`, and `untitled-ui`.
- `untitled-ui` bundled adapter. Its free license forbids redistribution and
  derivative icon libraries; the generated license comment says so.

## 0.4.0

### Breaking

- Components are named `Icon` + (`as` | PascalCase(name)); library prefixes
  (`LuHouse`) and the set-level `prefix` field are gone. Manifests that still
  declare `prefix` fail on load. File names and CSS classes drop the prefix too
  (`house.svg`, `.sigil-house`). Cross-library duplicates now collide; resolve
  them with `as`.
