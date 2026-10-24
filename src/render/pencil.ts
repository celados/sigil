import type { Element, Node } from '../svg-attrs.ts'
import type { NamedIcon, Renderer } from './types.ts'

import { formatRef } from '../ref.ts'
import { parse, SHAPES } from '../svg-attrs.ts'
import { licenseTag } from './types.ts'

/**
 * Pencil (@celados/pencil) designs are pen.dev scene graphs written as TSX. Pen
 * has no SVG node, so each icon becomes Path nodes: every shape is converted to
 * path data, and paint stays as the icon declares it with currentColor bound to
 * a `color` prop. Shapes sharing a stroke-only paint merge into one Path;
 * anything else (fills, differing paint, opacity) becomes one Path per shape
 * inside a Frame, which keeps SVG's painting order.
 */

type Layer = {
	d: string
	fill?: string
	stroke?: string
	strokeWidth?: number
	linecap?: string
	linejoin?: string
	evenodd?: true
	opacity?: number
}

const GEOMETRY: Record<string, string[]> = {
	path: ['d'],
	circle: ['cx', 'cy', 'r'],
	ellipse: ['cx', 'cy', 'rx', 'ry'],
	rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
	line: ['x1', 'y1', 'x2', 'y2'],
	polyline: ['points'],
	polygon: ['points'],
}
const INHERITED = [
	'fill',
	'stroke',
	'stroke-width',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-miterlimit',
	'fill-rule',
]
const IGNORED_TAGS = new Set(['title', 'desc'])

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g

const num = (el: Element, name: string) =>
	Number(el.attrs.find(([k]) => k === name)?.[1] ?? 0)

/**
 * A leading `m` is absolute only at the start of a path; once paths are
 * concatenated it would turn relative, so rewrite it as `M` plus the implicit
 * relative lineto that followed it.
 */
function absoluteStart(d: string): string {
	const m = /^\s*m\s*([^a-zA-Z]*)([\s\S]*)$/.exec(d)
	if (!m) return d.trim()
	const [x, y, ...rest] = m[1]!.match(NUMBER) ?? []
	return `M${x} ${y}${rest.length ? `l${rest.join(' ')}` : ''}${m[2]}`
}

function pointsPath(points: string, close: boolean): string {
	const n = points.match(NUMBER) ?? []
	const pairs: string[] = []
	for (let i = 0; i + 1 < n.length; i += 2) pairs.push(`${n[i]} ${n[i + 1]}`)
	return `M${pairs.join('L')}${close ? 'z' : ''}`
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
	return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`
}

function rectPath(el: Element): string {
	const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((k) => num(el, k)) as [
		number,
		number,
		number,
		number,
	]
	const has = (k: string) => el.attrs.some(([name]) => name === k)
	let rx = has('rx') ? num(el, 'rx') : has('ry') ? num(el, 'ry') : 0
	let ry = has('ry') ? num(el, 'ry') : rx
	rx = Math.min(rx, w / 2)
	ry = Math.min(ry, h / 2)
	if (!rx || !ry) return `M${x} ${y}h${w}v${h}h${-w}z`
	const arc = (dx: number, dy: number) => `a${rx} ${ry} 0 0 1 ${dx} ${dy}`
	return (
		`M${x + rx} ${y}h${w - 2 * rx}${arc(rx, ry)}v${h - 2 * ry}${arc(-rx, ry)}` +
		`h${-(w - 2 * rx)}${arc(-rx, -ry)}v${-(h - 2 * ry)}${arc(rx, -ry)}z`
	)
}

function shapePath(el: Element): string {
	switch (el.tag) {
		case 'path':
			return absoluteStart(el.attrs.find(([k]) => k === 'd')?.[1] ?? '')
		case 'circle':
			return ellipsePath(
				num(el, 'cx'),
				num(el, 'cy'),
				num(el, 'r'),
				num(el, 'r'),
			)
		case 'ellipse':
			return ellipsePath(
				num(el, 'cx'),
				num(el, 'cy'),
				num(el, 'rx'),
				num(el, 'ry'),
			)
		case 'rect':
			return rectPath(el)
		case 'line':
			return `M${num(el, 'x1')} ${num(el, 'y1')}L${num(el, 'x2')} ${num(el, 'y2')}`
		default:
			return pointsPath(
				el.attrs.find(([k]) => k === 'points')?.[1] ?? '',
				el.tag === 'polygon',
			)
	}
}

/** Pen paints solid colors only; currentColor becomes the `color` prop. */
function paint(value: string | undefined, what: string): string | undefined {
	if (value === undefined || value === 'none') return undefined
	if (value === 'currentColor' || /^#[0-9a-fA-F]{3,8}$/.test(value))
		return value
	throw new Error(`${what} "${value}" is not a solid color`)
}

function layerOf(el: Element, inherited: Map<string, string>): Layer {
	const style = new Map(inherited)
	let opacity: number | undefined
	for (const [k, v] of el.attrs) {
		if (GEOMETRY[el.tag]!.includes(k)) continue
		if (INHERITED.includes(k)) style.set(k, v)
		else if (k === 'opacity') opacity = Number(v)
		else throw new Error(`<${el.tag} ${k}> is not supported`)
	}
	// SVG's initial values: black fill, no stroke, 1-unit stroke.
	const fill = paint(style.get('fill') ?? '#000000', 'fill')
	const stroke = paint(style.get('stroke'), 'stroke')
	return {
		d: shapePath(el),
		...(fill && { fill }),
		...(stroke && {
			stroke,
			strokeWidth: Number(style.get('stroke-width') ?? 1),
			...(style.has('stroke-linecap') && {
				linecap: style.get('stroke-linecap'),
			}),
			...(style.has('stroke-linejoin') && {
				linejoin: style.get('stroke-linejoin'),
			}),
		}),
		...(fill &&
			style.get('fill-rule') === 'evenodd' && { evenodd: true as const }),
		...(opacity !== undefined && opacity !== 1 && { opacity }),
	}
}

function collect(nodes: Node[], inherited: Map<string, string>, out: Layer[]) {
	for (const node of nodes) {
		if (typeof node === 'string' || IGNORED_TAGS.has(node.tag)) continue
		if (SHAPES.has(node.tag)) {
			out.push(layerOf(node, inherited))
		} else if (node.tag === 'g') {
			const next = new Map(inherited)
			for (const [k, v] of node.attrs) {
				if (!INHERITED.includes(k)) throw new Error(`<g ${k}> is not supported`)
				next.set(k, v)
			}
			collect(node.children, next, out)
		} else {
			throw new Error(`<${node.tag}> is not supported`)
		}
	}
}

const paintKey = ({ d: _, ...paint }: Layer) => JSON.stringify(paint)

export function iconLayers(icon: NamedIcon): Layer[] {
	const layers: Layer[] = []
	collect(parse(icon.body), new Map(Object.entries(icon.attrs)), layers)
	// Strokes merge losslessly; merged fills would let nonzero winding punch
	// holes where separate shapes overlap.
	return layers.reduce<Layer[]>((merged, layer) => {
		const last = merged[merged.length - 1]
		if (
			last &&
			!last.fill &&
			!layer.fill &&
			paintKey(last) === paintKey(layer)
		) {
			last.d += layer.d
		} else {
			merged.push({ ...layer })
		}
		return merged
	}, [])
}

const HEADER = `// Auto-generated by sigil — do not edit. Run \`sigil etch\` to regenerate.

import { Frame, Path } from '@celados/pencil'

import type { ColorOr, NumberOr } from '@celados/pencil'

export type IconProps = {
	id?: string
	name?: string
	x?: number
	y?: number
	opacity?: NumberOr
	/** Width in px; defaults to the icon's own width (24 for most sets). */
	size?: number
	/** Replaces currentColor. */
	color?: ColorOr
	/** In the icon's own units, like stroke-width on the app's <svg>. */
	strokeWidth?: number
}

type Layer = {
	d: string
	fill?: string
	stroke?: string
	strokeWidth?: number
	linecap?: 'butt' | 'round' | 'square'
	linejoin?: 'miter' | 'round' | 'bevel'
	evenodd?: true
	opacity?: number
}

type ViewBox = [number, number, number, number]

// Pen strokes in node pixels, so stroke widths scale with size here.
function icon(props: IconProps, viewBox: ViewBox, layers: Layer[]) {
	const width = props.size ?? viewBox[2]
	const height = (width * viewBox[3]) / viewBox[2]
	const color = props.color ?? '#000000'
	const paint = (value?: string) =>
		value === 'currentColor' ? color : (value as ColorOr | undefined)
	const own = { id: props.id, name: props.name, x: props.x, y: props.y, opacity: props.opacity }
	const path = (layer: Layer, extra: Partial<typeof own> = {}) => (
		<Path
			{...extra}
			geometry={layer.d}
			viewBox={viewBox}
			width={width}
			height={height}
			fill={paint(layer.fill)}
			stroke={paint(layer.stroke)}
			strokeWidth={
				layer.stroke
					? ((props.strokeWidth ?? layer.strokeWidth ?? 1) * width) / viewBox[2]
					: undefined
			}
			strokeLinecap={layer.linecap}
			strokeLinejoin={layer.linejoin}
			fillRule={layer.evenodd ? 'evenodd' : undefined}
			opacity={extra.opacity ?? layer.opacity}
		/>
	)
	const [only, ...rest] = layers
	if (only && rest.length === 0 && only.opacity === undefined) return path(only, own)
	return (
		<Frame {...own} layout="none" width={width} height={height}>
			{layers.map((layer) => path(layer))}
		</Frame>
	)
}
`

export const pencilRenderer: Renderer = {
	id: 'pencil',
	defaultFile: 'icons.tsx',
	render(icons) {
		const parts = icons.map((icon) => {
			let layers: Layer[]
			try {
				layers = iconLayers(icon)
			} catch (e) {
				throw new Error(`${formatRef(icon.ref)}: ${(e as Error).message}`)
			}
			const viewBox = icon.viewBox.split(/[\s,]+/).map(Number)
			return (
				`// ${formatRef(icon.ref)}${licenseTag(icon)}\n` +
				`export const ${icon.componentName} = (props: IconProps) =>\n` +
				`\ticon(props, ${JSON.stringify(viewBox)}, ${JSON.stringify(layers)})`
			)
		})
		return [
			{ path: 'icons.tsx', content: [HEADER, ...parts].join('\n') + '\n' },
		]
	},
}
