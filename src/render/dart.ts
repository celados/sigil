import type { Element, Node } from '../svg-attrs.ts'
import type { Affine, Command } from './geometry.ts'
import type { NamedIcon, RenderedFile, Renderer } from './types.ts'

import { formatRef } from '../ref.ts'
import { parse, SHAPES } from '../svg-attrs.ts'
import {
	attr,
	GEOMETRY,
	IDENTITY,
	isIdentity,
	multiply,
	parsePath,
	parseTransform,
	pathBounds,
	shapePath,
} from './geometry.ts'
import { GENERATED_MARK, licenseTag, SHELL_FILE } from './types.ts'

/**
 * Flutter target. Each icon becomes a const paint tree whose shapes are
 * `Path` builders emitted at etch time (moveTo/lineTo/cubicTo/arcToPoint), so
 * the app never parses SVG and depends on nothing but
 * `package:flutter/widgets.dart`. Paint semantics follow the web output:
 * currentColor binds to the widget's color (the ambient text color by
 * default), strokes that inherit the root stroke-width follow the widget's
 * strokeWidth, and the set's cssMode decides whether authored colors survive
 * (`image`) or every paint becomes currentColor at its own alpha (`mask`), as
 * the CSS target renders them.
 */

// ---------------------------------------------------------------------------
// Paint tree (the IR the Dart code is printed from)

type Color = { argb: number } | { alpha: number }
type Stop = { offset: number; color: Color }
type Spread = 'pad' | 'reflect' | 'repeat'
type Paint =
	| { kind: 'color'; color: Color }
	| {
			kind: 'linear'
			x1: number
			y1: number
			x2: number
			y2: number
			stops: Stop[]
			transform?: Affine
			spread: Spread
	  }
	| {
			kind: 'radial'
			cx: number
			cy: number
			r: number
			fx: number
			fy: number
			fr: number
			stops: Stop[]
			transform?: Affine
			spread: Spread
	  }

type Shape = {
	type: 'shape'
	cmds: Command[]
	evenodd: boolean
	fill?: Paint
	stroke?: Paint
	/** Absent: the icon's own stroke width, which the widget can replace. */
	strokeWidth?: number
	cap: string
	join: string
	miter: number
	/** Gaussian blur sigma, user space. */
	blur?: number
	/** paint-order puts the stroke under the fill. */
	strokeFirst?: true
}
type ClipPart = { cmds: Command[]; evenodd: boolean; transform?: Affine }
type Group = {
	type: 'group'
	children: IrNode[]
	transform?: Affine
	opacity?: number
	clip?: ClipPart[]
	mask?: { nodes: IrNode[]; alpha: boolean }
}
type IrNode = Shape | Group

// ---------------------------------------------------------------------------
// SVG → paint tree

const INHERITED = new Set([
	'fill',
	'stroke',
	'stroke-width',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-miterlimit',
	'fill-rule',
	'fill-opacity',
	'stroke-opacity',
	'clip-rule',
	'color',
	'visibility',
	'paint-order',
])
const LOCAL = new Set([
	'opacity',
	'transform',
	'clip-path',
	'mask',
	'filter',
	'display',
])
/** Attributes that never change how a shape paints. */
const INERT = new Set([
	'id',
	'class',
	'xml:space',
	'version',
	'enable-background',
	'overflow',
	'flex',
	'max-height',
	'max-width',
	'shape-rendering',
	'image-rendering',
	'text-rendering',
	'color-interpolation',
	'color-interpolation-filters',
	'color-rendering',
	'stroke-dashoffset',
	'font-family',
	'font-size',
	'font-weight',
	'font-style',
	'letter-spacing',
	'word-spacing',
	'mask-type',
	'isolation',
])
/** Unsupported features that are harmless when switched off. */
const OFF_WHEN_NONE = new Set(['stroke-dasharray', 'mix-blend-mode'])
const COLOR_PROPERTIES = new Set(['fill', 'stroke', 'color', 'stop-color'])
/** Elements that are only ever referenced, never painted in place. */
const REFERENCED = new Set([
	'defs',
	'linearGradient',
	'radialGradient',
	'clipPath',
	'mask',
	'filter',
	'symbol',
	'pattern',
	'marker',
])
const SKIPPED = new Set(['title', 'desc', 'metadata'])

const NAMED: Record<string, number> = {
	black: 0x000000,
	white: 0xffffff,
	red: 0xff0000,
	green: 0x008000,
	blue: 0x0000ff,
	yellow: 0xffff00,
	cyan: 0x00ffff,
	aqua: 0x00ffff,
	magenta: 0xff00ff,
	fuchsia: 0xff00ff,
	gray: 0x808080,
	grey: 0x808080,
	silver: 0xc0c0c0,
	maroon: 0x800000,
	olive: 0x808000,
	lime: 0x00ff00,
	teal: 0x008080,
	navy: 0x000080,
	purple: 0x800080,
	orange: 0xffa500,
}

type Context = {
	style: Map<string, string>
	/** stroke-width was set below the root, so the widget's value does not apply. */
	ownStrokeWidth: boolean
}

type Doc = {
	ids: Map<string, Element>
	viewBox: [number, number, number, number]
	mask: boolean
	root: Context
}

/** Presentation attributes with `style` declarations layered on top. */
function propertiesOf(el: Element): [string, string][] {
	const props = new Map<string, string>()
	for (const [k, v] of el.attrs) if (k !== 'style') props.set(k, v.trim())
	const style = attr(el, 'style')
	if (style) {
		for (const decl of style.split(';')) {
			const at = decl.indexOf(':')
			if (at < 0) continue
			props.set(decl.slice(0, at).trim(), decl.slice(at + 1).trim())
		}
	}
	for (const [k, v] of props) {
		const m = /^var\(\s*--[\w-]+\s*,\s*(.+)\)$/.exec(v)
		if (m) props.set(k, m[1]!.trim())
		// A malformed hex color is ignored, so the inherited value applies.
		if (
			COLOR_PROPERTIES.has(k) &&
			/^#[0-9a-fA-F]*$/.test(v) &&
			![4, 5, 7, 9].includes(v.length)
		)
			props.delete(k)
	}
	return [...props]
}

/** display-p3 → sRGB (clamped), since the paint tree is sRGB. */
function p3ToSrgb(r: number, g: number, b: number): [number, number, number] {
	const lin = (c: number) =>
		c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	const gam = (c: number) =>
		c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
	const [lr, lg, lb] = [lin(r), lin(g), lin(b)]
	return [
		1.2249401 * lr - 0.2249404 * lg,
		-0.0420569 * lr + 1.0420571 * lg,
		-0.0196376 * lr - 0.0786361 * lg + 1.0982735 * lb,
	].map((c) => gam(Math.max(0, Math.min(1, c)))) as [number, number, number]
}

function parseColor(value: string, what: string): Color | null {
	const v = value.trim()
	if (v === 'none' || v === 'transparent') return null
	if (v === 'currentColor' || v === 'currentcolor') return { alpha: 1 }
	let m = /^#([0-9a-fA-F]{3,8})$/.exec(v)
	if (m && [3, 4, 6, 8].includes(m[1]!.length)) {
		let hex = m[1]!
		if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('')
		const rgb = parseInt(hex.slice(0, 6), 16)
		const a = hex.length === 8 ? parseInt(hex.slice(6), 16) : 255
		return { argb: ((a << 24) | rgb) >>> 0 }
	}
	m = /^rgba?\(([^)]*)\)$/i.exec(v)
	if (m) {
		const parts = m[1]!.split(/[\s,/]+/).filter(Boolean)
		const channel = (p: string) =>
			p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p)
		const [r, g, b] = parts.slice(0, 3).map(channel) as [number, number, number]
		const a = parts[3]
			? parts[3].endsWith('%')
				? parseFloat(parts[3]) / 100
				: parseFloat(parts[3])
			: 1
		const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
		return {
			argb:
				((byte(a * 255) << 24) | (byte(r) << 16) | (byte(g) << 8) | byte(b)) >>>
				0,
		}
	}
	m = /^color\(\s*(display-p3|srgb)\s+([^)]*)\)$/i.exec(v)
	if (m) {
		const [values, alphaPart] = m[2]!.split('/')
		const c = values!
			.trim()
			.split(/\s+/)
			.map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p))) as [
			number,
			number,
			number,
		]
		const [r, g, b] = m[1]!.toLowerCase() === 'srgb' ? c : p3ToSrgb(...c)
		const a = alphaPart ? opacity(alphaPart.trim()) : 1
		const byte = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)))
		return {
			argb:
				((byte(a) << 24) | (byte(r) << 16) | (byte(g) << 8) | byte(b)) >>> 0,
		}
	}
	const named = NAMED[v.toLowerCase()]
	if (named !== undefined) return { argb: (0xff000000 | named) >>> 0 }
	throw new Error(`${what} "${value}" is not a supported color`)
}

function withAlpha(color: Color, factor: number): Color {
	if (factor >= 1) return color
	if ('alpha' in color) return { alpha: color.alpha * factor }
	const a = Math.round((color.argb >>> 24) * factor)
	return { argb: ((a << 24) | (color.argb & 0xffffff)) >>> 0 }
}

function unit(value: string | undefined, fallback: number): number {
	if (value === undefined || value === '') return fallback
	const n = parseFloat(value)
	if (Number.isNaN(n)) throw new Error(`malformed number "${value}"`)
	return n
}

function opacity(value: string | undefined): number {
	if (value === undefined) return 1
	const n = value.endsWith('%') ? parseFloat(value) / 100 : parseFloat(value)
	return Math.max(0, Math.min(1, Number.isNaN(n) ? 1 : n))
}

function urlId(value: string): string | undefined {
	return /^url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(value)?.[1]
}

function href(el: Element): string | undefined {
	const v = attr(el, 'xlink:href') ?? attr(el, 'href')
	return v?.startsWith('#') ? v.slice(1) : undefined
}

function gradientPaint(
	el: Element,
	doc: Doc,
	cmds: Command[],
	alpha: number,
): Paint | undefined {
	// Attributes and stops inherit along the href chain.
	const chain: Element[] = []
	for (let at: Element | undefined = el; at && !chain.includes(at);) {
		chain.push(at)
		const next = href(at)
		at = next ? doc.ids.get(next) : undefined
	}
	const get = (name: string) => {
		for (const g of chain) {
			const v = attr(g, name)
			if (v !== undefined) return v
		}
		return undefined
	}
	const stopsOwner = chain.find((g) =>
		g.children.some((c) => typeof c !== 'string' && c.tag === 'stop'),
	)
	const stops: Stop[] = []
	let last = 0
	for (const stop of stopsOwner?.children ?? []) {
		if (typeof stop === 'string' || stop.tag !== 'stop') continue
		const props = new Map(propertiesOf(stop))
		const raw = props.get('offset') ?? '0'
		const offset = Math.max(
			last,
			Math.min(
				1,
				Math.max(
					0,
					raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw) || 0,
				),
			),
		)
		last = offset
		const color = parseColor(
			props.get('stop-color') ?? '#000',
			'stop-color',
		) ?? {
			argb: 0,
		}
		stops.push({
			offset,
			color: withAlpha(color, opacity(props.get('stop-opacity')) * alpha),
		})
	}
	if (stops.length === 0) return undefined
	if (stops.length === 1) return { kind: 'color', color: stops[0]!.color }

	const bbox =
		(get('gradientUnits') ?? 'objectBoundingBox') === 'objectBoundingBox'
	const [, , vw, vh] = doc.viewBox
	const coord = (name: string, fallback: string, axis: 'x' | 'y' | 'r') => {
		const v = get(name) ?? fallback
		if (!v.endsWith('%')) return unit(v, 0)
		const f = parseFloat(v) / 100
		if (bbox) return f
		return (
			f *
			(axis === 'x' ? vw : axis === 'y' ? vh : Math.hypot(vw, vh) / Math.SQRT2)
		)
	}
	let transform = get('gradientTransform')
		? parseTransform(get('gradientTransform')!)
		: IDENTITY
	if (bbox) {
		const [bx, by, bw, bh] = pathBounds(cmds)
		// No area means no box to resolve against: SVG paints nothing.
		if (!bw || !bh) return undefined
		transform = multiply([bw, 0, 0, bh, bx, by], transform)
	}
	const spread = (get('spreadMethod') ?? 'pad') as Spread
	const common = {
		stops,
		spread,
		...(isIdentity(transform) ? {} : { transform }),
	}
	if (el.tag === 'linearGradient') {
		return {
			kind: 'linear',
			x1: coord('x1', '0%', 'x'),
			y1: coord('y1', '0%', 'y'),
			x2: coord('x2', '100%', 'x'),
			y2: coord('y2', '0%', 'y'),
			...common,
		}
	}
	const cx = coord('cx', '50%', 'x')
	const cy = coord('cy', '50%', 'y')
	return {
		kind: 'radial',
		cx,
		cy,
		r: coord('r', '50%', 'r'),
		fx: get('fx') === undefined ? cx : coord('fx', '50%', 'x'),
		fy: get('fy') === undefined ? cy : coord('fy', '50%', 'y'),
		fr: coord('fr', '0%', 'r'),
		...common,
	}
}

function resolvePaint(
	value: string | undefined,
	what: string,
	ctx: Context,
	doc: Doc,
	cmds: Command[],
	alpha: number,
): Paint | undefined {
	if (value === undefined) return undefined
	const id = urlId(value)
	if (id) {
		const target = doc.ids.get(id)
		if (!target) {
			// An unresolved reference falls back to the color after it, or nothing.
			const fallback = value.replace(/^url\([^)]*\)\s*/, '')
			return fallback
				? resolvePaint(fallback, what, ctx, doc, cmds, alpha)
				: undefined
		}
		if (target.tag !== 'linearGradient' && target.tag !== 'radialGradient') {
			throw new Error(`${what} <${target.tag}> is not supported`)
		}
		return gradientPaint(target, doc, cmds, alpha)
	}
	let color = parseColor(value, what)
	if (color && 'alpha' in color) {
		// currentColor is the nearest `color` property when the icon sets one.
		const own = ctx.style.get('color')
		if (own && !/^currentcolor$/i.test(own)) color = parseColor(own, 'color')
	}
	return color ? { kind: 'color', color: withAlpha(color, alpha) } : undefined
}

function readProperties(
	el: Element,
	ctx: Context,
): { ctx: Context; local: Map<string, string> } {
	const style = new Map(ctx.style)
	let ownStrokeWidth = ctx.ownStrokeWidth
	const local = new Map<string, string>()
	const geometry = GEOMETRY[el.tag] ?? []
	for (const [k, v] of propertiesOf(el)) {
		if (geometry.includes(k)) continue
		if (INHERITED.has(k)) {
			if (v === 'inherit') continue
			style.set(k, v)
			if (k === 'stroke-width') ownStrokeWidth = true
		} else if (LOCAL.has(k)) {
			local.set(k, v)
		} else if (
			INERT.has(k) ||
			k.startsWith('data-') ||
			k.startsWith('xmlns') ||
			k.startsWith('aria-') ||
			k.startsWith('-') ||
			(k.includes(':') && !k.startsWith('xlink:')) ||
			k.startsWith('margin') ||
			k === 'line-height' ||
			(el.tag === 'use' &&
				['x', 'y', 'width', 'height', 'href', 'xlink:href'].includes(k))
		) {
			// no effect on pixels
		} else if (OFF_WHEN_NONE.has(k) && v === 'none') {
			// switched off
		} else {
			throw new Error(`<${el.tag} ${k}> is not supported`)
		}
	}
	return { ctx: { style, ownStrokeWidth }, local }
}

function clipParts(id: string, doc: Doc, seen: Set<string>): ClipPart[] {
	const el = doc.ids.get(id)
	if (!el) return []
	if (el.tag !== 'clipPath')
		throw new Error(`clip-path #${id} is not a <clipPath>`)
	if (seen.has(id)) throw new Error(`clip-path #${id} references itself`)
	if ((attr(el, 'clipPathUnits') ?? 'userSpaceOnUse') !== 'userSpaceOnUse') {
		throw new Error('clipPathUnits="objectBoundingBox" is not supported')
	}
	if (attr(el, 'clip-path'))
		throw new Error('nested clip-path is not supported')
	const base = attr(el, 'transform')
		? parseTransform(attr(el, 'transform')!)
		: IDENTITY
	const parts: ClipPart[] = []
	const walk = (nodes: Node[], m: Affine, rule: string) => {
		for (const node of nodes) {
			if (typeof node === 'string' || SKIPPED.has(node.tag)) continue
			const props = new Map(propertiesOf(node))
			if (props.get('display') === 'none') continue
			const own = props.get('transform')
			const t = own ? multiply(m, parseTransform(own)) : m
			const r = props.get('clip-rule') ?? rule
			if (SHAPES.has(node.tag)) {
				const cmds = parsePath(shapePath(node))
				if (cmds.length)
					parts.push({
						cmds,
						evenodd: r === 'evenodd',
						...(isIdentity(t) ? {} : { transform: t }),
					})
			} else if (node.tag === 'use') {
				const target = href(node) && doc.ids.get(href(node)!)
				if (!target) continue
				const shift: Affine = [
					1,
					0,
					0,
					1,
					unit(attr(node, 'x'), 0),
					unit(attr(node, 'y'), 0),
				]
				walk([target], multiply(t, shift), r)
			} else if (node.tag === 'g') {
				walk(node.children, t, r)
			} else {
				throw new Error(`<clipPath> child <${node.tag}> is not supported`)
			}
		}
	}
	walk(el.children, base, attr(el, 'clip-rule') ?? 'nonzero')
	return parts
}

/** Wraps nodes in a group for the element's transform, clip and opacity; none of them → the nodes as they are. */
function wrap(
	nodes: IrNode[],
	local: Map<string, string>,
	doc: Doc,
	opacityValue: number,
	extra: Affine = IDENTITY,
): IrNode[] {
	if (nodes.length === 0) return nodes
	const own = local.get('transform')
	const transform = own ? multiply(parseTransform(own), extra) : extra
	const clipRef = local.get('clip-path')
	const clipId = clipRef && clipRef !== 'none' ? urlId(clipRef) : undefined
	if (clipRef && clipRef !== 'none' && !clipId) {
		throw new Error(`clip-path "${clipRef}" is not supported`)
	}
	// A reference to nothing does not clip, as in browsers; an empty clipPath hides everything.
	const clipEl = clipId ? doc.ids.get(clipId) : undefined
	const clip = clipEl ? clipParts(clipId!, doc, new Set()) : undefined
	if (clip && clip.length === 0) return []
	const maskRef = local.get('mask')
	const maskId = maskRef && maskRef !== 'none' ? urlId(maskRef) : undefined
	if (maskRef && maskRef !== 'none' && !maskId) {
		throw new Error(`mask "${maskRef}" is not supported`)
	}
	const maskEl = maskId ? doc.ids.get(maskId) : undefined
	let mask: Group['mask']
	if (maskEl) {
		if (maskEl.tag !== 'mask')
			throw new Error(`mask #${maskId} is not a <mask>`)
		if (
			(attr(maskEl, 'maskContentUnits') ?? 'userSpaceOnUse') !==
			'userSpaceOnUse'
		) {
			throw new Error('maskContentUnits="objectBoundingBox" is not supported')
		}
		const props = new Map(propertiesOf(maskEl))
		const content = collect(maskEl.children, doc.root, doc)
		// An empty mask hides everything.
		if (content.length === 0) return []
		mask = { nodes: content, alpha: props.get('mask-type') === 'alpha' }
	}
	if (isIdentity(transform) && !clip && !mask && opacityValue >= 1) return nodes
	return [
		{
			type: 'group',
			children: nodes,
			...(isIdentity(transform) ? {} : { transform }),
			...(opacityValue < 1 ? { opacity: opacityValue } : {}),
			...(clip ? { clip } : {}),
			...(mask ? { mask } : {}),
		},
	]
}

function shapeOf(el: Element, ctx: Context, doc: Doc): Shape | undefined {
	const cmds = parsePath(shapePath(el))
	if (cmds.length === 0) return undefined
	const s = ctx.style
	// SVG's initial values: black fill, no stroke.
	const fill = resolvePaint(
		s.get('fill') ?? '#000000',
		'fill',
		ctx,
		doc,
		cmds,
		opacity(s.get('fill-opacity')),
	)
	let stroke = resolvePaint(
		s.get('stroke'),
		'stroke',
		ctx,
		doc,
		cmds,
		opacity(s.get('stroke-opacity')),
	)
	const width = s.has('stroke-width') ? unit(s.get('stroke-width'), 1) : 1
	if (stroke && width <= 0) stroke = undefined
	if (!fill && !stroke) return undefined
	return {
		type: 'shape',
		cmds,
		evenodd: s.get('fill-rule') === 'evenodd',
		...(fill && { fill }),
		...(stroke && {
			stroke,
			...(ctx.ownStrokeWidth && { strokeWidth: width }),
		}),
		cap: s.get('stroke-linecap') ?? 'butt',
		join: s.get('stroke-linejoin') ?? 'miter',
		miter: unit(s.get('stroke-miterlimit'), 4),
		...(fill &&
			stroke &&
			strokeBeforeFill(s.get('paint-order')) && { strokeFirst: true as const }),
	}
}

function strokeBeforeFill(order: string | undefined): boolean {
	if (!order || order === 'normal') return false
	const words = order.split(/\s+/)
	const at = (w: string) =>
		words.includes(w) ? words.indexOf(w) : words.length + (w === 'fill' ? 0 : 1)
	return at('stroke') < at('fill')
}

/**
 * The one filter Flutter's widgets layer can draw: a lone feGaussianBlur,
 * which becomes a blur mask filter on each shape's paint. On a group that
 * blurs each shape on its own rather than the composited group, which differs
 * only where blurred shapes overlap.
 */
function blurOf(value: string | undefined, doc: Doc): number | undefined {
	if (value === undefined || value === 'none') return undefined
	const id = urlId(value)
	const el = id ? doc.ids.get(id) : undefined
	if (!el) return undefined // a reference to nothing does not filter
	const primitives = el.children.filter(
		(c): c is Element => typeof c !== 'string' && !SKIPPED.has(c.tag),
	)
	const [only] = primitives
	const input = only && attr(only, 'in')
	const sigma =
		only && (attr(only, 'stdDeviation') ?? '0').trim().split(/[\s,]+/)
	if (
		el.tag !== 'filter' ||
		primitives.length !== 1 ||
		only!.tag !== 'feGaussianBlur' ||
		(input !== undefined && input !== 'SourceGraphic') ||
		(attr(el, 'primitiveUnits') ?? 'userSpaceOnUse') !== 'userSpaceOnUse' ||
		(sigma!.length === 2 && sigma![0] !== sigma![1])
	) {
		const tags = primitives.map((p) => `<${p.tag}>`).join(' ')
		throw new Error(
			`filter ${tags || 'with no primitives'} is not supported (only one uniform <feGaussianBlur>)`,
		)
	}
	const value_ = Number(sigma![0])
	return value_ > 0 ? value_ : undefined
}

function applyBlur(nodes: IrNode[], sigma: number): void {
	for (const node of nodes) {
		if (node.type === 'group') applyBlur(node.children, sigma)
		else node.blur = sigma
	}
}

function foldOpacity(shape: Shape, alpha: number): void {
	const fold = (p: Paint): Paint =>
		p.kind === 'color'
			? { kind: 'color', color: withAlpha(p.color, alpha) }
			: {
					...p,
					stops: p.stops.map((st) => ({
						...st,
						color: withAlpha(st.color, alpha),
					})),
				}
	if (shape.fill) shape.fill = fold(shape.fill)
	if (shape.stroke) shape.stroke = fold(shape.stroke)
}

function collect(nodes: Node[], ctx: Context, doc: Doc, depth = 0): IrNode[] {
	if (depth > 32) throw new Error('<use> nesting is too deep')
	const out: IrNode[] = []
	for (const node of nodes) {
		if (typeof node === 'string') continue
		const tag = node.tag
		if (SKIPPED.has(tag) || REFERENCED.has(tag) || tag.includes(':')) continue
		if (!SHAPES.has(tag) && tag !== 'g' && tag !== 'use') {
			throw new Error(`<${tag}> is not supported`)
		}
		const { ctx: next, local } = readProperties(node, ctx)
		if (local.get('display') === 'none') continue
		const alpha = opacity(local.get('opacity'))
		if (alpha <= 0) continue
		if (SHAPES.has(tag)) {
			if (/^(hidden|collapse)$/.test(next.style.get('visibility') ?? ''))
				continue
			const shape = shapeOf(node, next, doc)
			if (!shape) continue
			// One paint drawn once: opacity is exact as paint alpha.
			const single = !(shape.fill && shape.stroke)
			if (single) foldOpacity(shape, alpha)
			const blur = blurOf(local.get('filter'), doc)
			if (blur) shape.blur = blur
			out.push(...wrap([shape], local, doc, single ? 1 : alpha))
		} else if (tag === 'g') {
			const children = collect(node.children, next, doc, depth)
			const blur = blurOf(local.get('filter'), doc)
			if (blur) applyBlur(children, blur)
			out.push(...wrap(children, local, doc, alpha))
		} else {
			const id = href(node)
			const target = id ? doc.ids.get(id) : undefined
			if (!target) continue
			if (target.tag === 'symbol')
				throw new Error('<use> of <symbol> is not supported')
			const shift: Affine = [
				1,
				0,
				0,
				1,
				unit(attr(node, 'x'), 0),
				unit(attr(node, 'y'), 0),
			]
			const children = collect([target], next, doc, depth + 1)
			const blur = blurOf(local.get('filter'), doc)
			if (blur) applyBlur(children, blur)
			out.push(...wrap(children, local, doc, alpha, shift))
		}
	}
	return merge(out)
}

const strokeKey = (s: Shape) =>
	JSON.stringify([s.stroke, s.strokeWidth, s.cap, s.join, s.miter, s.blur])

/**
 * Adjacent stroke-only shapes with one opaque color paint merge losslessly
 * into one Path. Fills never merge: nonzero winding would punch holes where
 * separate shapes overlap.
 */
function merge(nodes: IrNode[]): IrNode[] {
	const out: IrNode[] = []
	for (const node of nodes) {
		const last = out[out.length - 1]
		const mergeable = (n: IrNode | undefined): n is Shape =>
			n?.type === 'shape' &&
			!n.fill &&
			n.stroke?.kind === 'color' &&
			('alpha' in n.stroke.color
				? n.stroke.color.alpha === 1
				: n.stroke.color.argb >>> 24 === 0xff)
		if (
			mergeable(last) &&
			mergeable(node) &&
			strokeKey(last) === strokeKey(node)
		) {
			last.cmds = [...last.cmds, ...node.cmds]
		} else {
			out.push(node.type === 'shape' ? { ...node } : node)
		}
	}
	return out
}

/** CSS mask mode: every paint becomes currentColor at the alpha it was authored with. */
function maskColors(nodes: IrNode[]): void {
	const toCurrent = (c: Color): Color =>
		'alpha' in c ? c : { alpha: (c.argb >>> 24) / 255 }
	const paint = (p: Paint): Paint =>
		p.kind === 'color'
			? { kind: 'color', color: toCurrent(p.color) }
			: {
					...p,
					stops: p.stops.map((s) => ({ ...s, color: toCurrent(s.color) })),
				}
	for (const node of nodes) {
		if (node.type === 'group') {
			maskColors(node.children)
			continue
		}
		if (node.fill) node.fill = paint(node.fill)
		if (node.stroke) node.stroke = paint(node.stroke)
	}
}

function indexIds(nodes: Node[], ids: Map<string, Element>): void {
	for (const node of nodes) {
		if (typeof node === 'string') continue
		const id = attr(node, 'id')
		if (id && !ids.has(id)) ids.set(id, node)
		indexIds(node.children, ids)
	}
}

/** The icon's paint tree in viewBox units. */
export function iconTree(icon: NamedIcon): {
	nodes: IrNode[]
	strokeWidth: number
} {
	const body = parse(icon.body)
	if (body.some((n) => typeof n !== 'string' && n.tag === 'style')) {
		throw new Error('<style> is not supported')
	}
	const ids = new Map<string, Element>()
	indexIds(body, ids)
	const viewBox = icon.viewBox.split(/[\s,]+/).map(Number) as Doc['viewBox']
	const root: Context = {
		style: new Map(Object.entries(icon.attrs)),
		ownStrokeWidth: false,
	}
	const doc: Doc = { ids, viewBox, mask: icon.cssMode === 'mask', root }
	const nodes = collect(body, root, doc)
	if (doc.mask) maskColors(nodes)
	return { nodes, strokeWidth: unit(icon.attrs['stroke-width'], 1) }
}

// ---------------------------------------------------------------------------
// Paint tree → Dart

const n = (v: number) => {
	const r = Math.round(v * 1e4) / 1e4
	return Object.is(r, -0) ? '0' : String(r)
}
const list = (vs: number[]) => `[${vs.map(n).join(', ')}]`
const dartString = (s: string) =>
	`'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$')}'`

function pathBody(cmds: Command[], evenodd: boolean): string {
	const lines = evenodd ? ['..fillType = PathFillType.evenOdd'] : []
	let x = 0
	let y = 0
	let sx = 0
	let sy = 0
	for (const c of cmds) {
		switch (c.k) {
			case 'M':
				lines.push(`..moveTo(${n(c.x)}, ${n(c.y)})`)
				sx = c.x
				sy = c.y
				break
			case 'L':
				lines.push(`..lineTo(${n(c.x)}, ${n(c.y)})`)
				break
			case 'C':
				lines.push(
					`..cubicTo(${[c.x1, c.y1, c.x2, c.y2, c.x, c.y].map(n).join(', ')})`,
				)
				break
			case 'Q':
				lines.push(
					`..quadraticBezierTo(${[c.x1, c.y1, c.x, c.y].map(n).join(', ')})`,
				)
				break
			case 'A': {
				// SVG draws a zero-radius arc as a line and skips one that ends where it starts.
				if (!c.rx || !c.ry) {
					lines.push(`..lineTo(${n(c.x)}, ${n(c.y)})`)
					break
				}
				if (c.x === x && c.y === y) break
				const radius =
					c.rx === c.ry
						? `const Radius.circular(${n(c.rx)})`
						: `const Radius.elliptical(${n(c.rx)}, ${n(c.ry)})`
				const args = [
					`const Offset(${n(c.x)}, ${n(c.y)})`,
					`radius: ${radius}`,
					...(c.rotation ? [`rotation: ${n(c.rotation)}`] : []),
					...(c.large ? ['largeArc: true'] : []),
					// SVG's positive-angle sweep is clockwise on a y-down canvas.
					...(c.sweep ? [] : ['clockwise: false']),
				]
				lines.push(`..arcToPoint(${args.join(', ')})`)
				break
			}
			case 'Z':
				lines.push('..close()')
				x = sx
				y = sy
				continue
		}
		x = c.x
		y = c.y
	}
	return `Path()\n  ${lines.join('\n  ')}`
}

function colorLiteral(argb: number): string {
	return `Color(0x${argb.toString(16).toUpperCase().padStart(8, '0')})`
}

const TILE: Record<Spread, string> = {
	pad: '',
	reflect: 'tileMode: TileMode.mirror',
	repeat: 'tileMode: TileMode.repeated',
}

function paintLiteral(p: Paint): string {
	if (p.kind === 'color') {
		const c = p.color
		if ('alpha' in c) {
			return c.alpha >= 1
				? 'SigilPaint.current'
				: `SigilCurrentColor(${n(c.alpha)})`
		}
		return `SigilSolidColor(${colorLiteral(c.argb)})`
	}
	const stops = p.stops
		.map((s) =>
			'alpha' in s.color
				? `SigilStop.current(${n(s.offset)}${s.color.alpha < 1 ? `, ${n(s.color.alpha)}` : ''})`
				: `SigilStop(${n(s.offset)}, ${colorLiteral(s.color.argb)})`,
		)
		.join(', ')
	const named = [
		...(p.transform ? [`transform: ${list(p.transform)}`] : []),
		...(TILE[p.spread] ? [TILE[p.spread]] : []),
	]
	if (p.kind === 'linear') {
		return `SigilLinearGradient(Offset(${n(p.x1)}, ${n(p.y1)}), Offset(${n(p.x2)}, ${n(p.y2)}), [${stops}]${named.map((a) => `, ${a}`).join('')})`
	}
	const focal =
		p.fx !== p.cx || p.fy !== p.cy
			? [`focal: Offset(${n(p.fx)}, ${n(p.fy)})`]
			: []
	const focalRadius = p.fr ? [`focalRadius: ${n(p.fr)}`] : []
	return `SigilRadialGradient(Offset(${n(p.cx)}, ${n(p.cy)}), ${n(p.r)}, [${stops}]${[...focal, ...focalRadius, ...named].map((a) => `, ${a}`).join('')})`
}

const CAP: Record<string, string> = {
	round: 'StrokeCap.round',
	square: 'StrokeCap.square',
}
const JOIN: Record<string, string> = {
	round: 'StrokeJoin.round',
	bevel: 'StrokeJoin.bevel',
}

type Emit = { builders: string[]; prefix: string }

function nodeLiteral(node: IrNode, emit: Emit, indent: string): string {
	if (node.type === 'group') {
		const children = node.children
			.map((c) => `${indent}  ${nodeLiteral(c, emit, `${indent}  `)},`)
			.join('\n')
		const named = [
			...(node.transform ? [`transform: ${list(node.transform)}`] : []),
			...(node.opacity !== undefined ? [`opacity: ${n(node.opacity)}`] : []),
			...(node.clip
				? [
						`clip: [${node.clip
							.map((part) => {
								const name = `_${emit.prefix}Clip${emit.builders.length}`
								emit.builders.push(
									`Path ${name}() => ${pathBody(part.cmds, part.evenodd)};`,
								)
								return `SigilClipPart(${name}${part.transform ? `, transform: ${list(part.transform)}` : ''})`
							})
							.join(', ')}]`,
					]
				: []),
		]
		if (node.mask) {
			const content = node.mask.nodes
				.map((c) => `${indent}    ${nodeLiteral(c, emit, `${indent}    `)},`)
				.join('\n')
			named.push(
				`mask: SigilMask([\n${content}\n${indent}  ]${node.mask.alpha ? ', alpha: true' : ''})`,
			)
		}
		return `SigilGroup([\n${children}\n${indent}]${named.map((a) => `, ${a}`).join('')})`
	}
	const name = `_${emit.prefix}${emit.builders.length}`
	emit.builders.push(`Path ${name}() => ${pathBody(node.cmds, node.evenodd)};`)
	const named = [
		...(node.fill ? [`fill: ${paintLiteral(node.fill)}`] : []),
		...(node.stroke
			? [
					`stroke: ${paintLiteral(node.stroke)}`,
					...(node.strokeWidth !== undefined
						? [`strokeWidth: ${n(node.strokeWidth)}`]
						: []),
					...(CAP[node.cap] ? [`strokeCap: ${CAP[node.cap]}`] : []),
					...(JOIN[node.join] ? [`strokeJoin: ${JOIN[node.join]}`] : []),
					...(node.miter !== 4 ? [`strokeMiterLimit: ${n(node.miter)}`] : []),
				]
			: []),
		...(node.blur ? [`blur: ${n(node.blur)}`] : []),
		...(node.strokeFirst ? ['strokeFirst: true'] : []),
	]
	return `SigilShape(${[name, ...named].join(', ')})`
}

/** `IconHome` → `iconHome`: the web component name, as a Dart constant. */
function dartName(icon: NamedIcon): string {
	return icon.componentName[0]!.toLowerCase() + icon.componentName.slice(1)
}

function iconSource(icon: NamedIcon): string {
	let tree
	try {
		tree = iconTree(icon)
	} catch (e) {
		throw new Error(`${formatRef(icon.ref)}: ${(e as Error).message}`)
	}
	const name = dartName(icon)
	const emit: Emit = { builders: [], prefix: name }
	const [x, y, w, h] = icon.viewBox.split(/[\s,]+/).map(Number) as [
		number,
		number,
		number,
		number,
	]
	const nodes = tree.nodes
		.map((node) => `    ${nodeLiteral(node, emit, '    ')},`)
		.join('\n')
	return (
		`/// ${formatRef(icon.ref)}${licenseTag(icon)}\n` +
		`const ${name} = SigilIconData(\n` +
		`  ${dartString(formatRef(icon.ref))},\n` +
		`  viewBox: Rect.fromLTWH(${[x, y, w, h].map(n).join(', ')}),\n` +
		(tree.strokeWidth !== 1 ? `  strokeWidth: ${n(tree.strokeWidth)},\n` : '') +
		`  nodes: [${nodes ? `\n${nodes}\n  ` : ''}],\n` +
		`);\n\n` +
		emit.builders.join('\n\n') +
		(emit.builders.length ? '\n' : '')
	)
}

// ---------------------------------------------------------------------------
// Runtime

// \`dart format off\` keeps a project's formatter from rewriting generated code.
const GENERATED = `${GENERATED_MARK} — do not edit. Run \`sigil etch\` to regenerate.\n// dart format off\n`

const IMPORT = `import 'package:flutter/widgets.dart';\n`

const RUNTIME = `/// An icon etched by sigil: its viewBox and a paint tree in viewBox units.
///
/// Draw it with [SigilIcon], or with [paintSigilIcon] inside your own painter.
@immutable
final class SigilIconData {
  /// An icon from [ref], drawn in [viewBox].
  const SigilIconData(
    this.ref, {
    required this.viewBox,
    this.strokeWidth = 1,
    required this.nodes,
  });

  /// The manifest ref, \`set/name\`.
  final String ref;

  /// The SVG viewBox the nodes are drawn in.
  final Rect viewBox;

  /// The icon's own stroke width (the root \`stroke-width\`). Strokes that
  /// inherit it follow [SigilIcon.strokeWidth] instead when that is set.
  final double strokeWidth;

  /// Painted in order, as SVG paints its elements.
  final List<SigilNode> nodes;
}

/// A node of an icon's paint tree.
sealed class SigilNode {
  /// Const base for generated nodes.
  const SigilNode();
}

/// A shape: one path, filled and then stroked.
final class SigilShape extends SigilNode {
  /// A shape whose path [build] makes.
  const SigilShape(
    this.build, {
    this.fill,
    this.stroke,
    this.strokeWidth,
    this.strokeCap = StrokeCap.butt,
    this.strokeJoin = StrokeJoin.miter,
    this.strokeMiterLimit = 4,
    this.blur = 0,
    this.strokeFirst = false,
  });

  /// Builds the path in viewBox units; called once, then cached.
  final Path Function() build;

  /// The fill, or \`null\` for none.
  final SigilPaint? fill;

  /// The stroke, or \`null\` for none.
  final SigilPaint? stroke;

  /// The shape's own stroke width; \`null\` inherits the icon's.
  final double? strokeWidth;

  /// SVG's \`stroke-linecap\`.
  final StrokeCap strokeCap;

  /// SVG's \`stroke-linejoin\`.
  final StrokeJoin strokeJoin;

  /// SVG's \`stroke-miterlimit\`.
  final double strokeMiterLimit;

  /// Gaussian blur sigma in viewBox units (SVG's \`feGaussianBlur\`).
  final double blur;

  /// SVG's \`paint-order: stroke\`: the stroke is drawn under the fill.
  final bool strokeFirst;

  static final _paths = Expando<Path>();

  /// The built path, shared by every paint of this icon.
  Path get path => _paths[this] ??= build();
}

/// A group: children drawn under a transform, a clip, a mask and a group
/// opacity.
final class SigilGroup extends SigilNode {
  /// A group of [children].
  const SigilGroup(
    this.children, {
    this.transform,
    this.opacity = 1,
    this.clip,
    this.mask,
  });

  /// Painted in order.
  final List<SigilNode> children;

  /// A 2D affine \`[a, b, c, d, e, f]\`, as SVG's \`matrix()\`.
  final List<double>? transform;

  /// Group opacity: the children are composited first, then faded.
  final double opacity;

  /// Clip shapes, unioned.
  final List<SigilClipPart>? clip;

  /// SVG's \`mask\`.
  final SigilMask? mask;

  static final _clips = Expando<Path>();

  /// The union of [clip], built once.
  Path? get clipPath {
    final parts = clip;
    if (parts == null) return null;
    return _clips[this] ??= parts
        .map((part) => part.path)
        .reduce((a, b) => Path.combine(PathOperation.union, a, b));
  }
}

/// SVG's \`<mask>\`: its nodes' luminance (or alpha) masks the group.
final class SigilMask {
  /// A mask painted by [nodes].
  const SigilMask(this.nodes, {this.alpha = false});

  /// The mask's content, in the group's user space.
  final List<SigilNode> nodes;

  /// \`mask-type: alpha\`.
  final bool alpha;
}

/// One shape of a group's clip.
final class SigilClipPart {
  /// A clip shape whose path [build] makes.
  const SigilClipPart(this.build, {this.transform});

  /// Builds the clip path in the group's user space.
  final Path Function() build;

  /// The clip shape's own transform, as [SigilGroup.transform].
  final List<double>? transform;

  /// The built path, transformed.
  Path get path {
    final m = transform;
    return m == null ? build() : build().transform(_matrix(m).storage);
  }
}

/// How a shape is filled or stroked.
sealed class SigilPaint {
  /// Const base for generated paints.
  const SigilPaint();

  /// The widget's color, which defaults to the ambient text color (the web's
  /// \`currentColor\`).
  static const current = SigilCurrentColor();
}

/// The widget's color at [alpha].
final class SigilCurrentColor extends SigilPaint {
  /// currentColor, faded to [alpha].
  const SigilCurrentColor([this.alpha = 1]);

  /// Multiplies the widget color's own alpha.
  final double alpha;
}

/// A color the icon was authored with.
final class SigilSolidColor extends SigilPaint {
  /// An authored [color].
  const SigilSolidColor(this.color);

  /// The authored color.
  final Color color;
}

/// A gradient stop: an authored color, or the widget's color at [alpha].
@immutable
final class SigilStop {
  /// A stop of an authored [color].
  const SigilStop(this.offset, Color this.color) : alpha = 1;

  /// A stop of the widget's color at [alpha].
  const SigilStop.current(this.offset, [this.alpha = 1]) : color = null;

  /// Position along the gradient, 0 to 1.
  final double offset;

  /// The authored color; \`null\` is the widget's color.
  final Color? color;

  /// Multiplies the widget color's alpha when [color] is \`null\`.
  final double alpha;
}

/// SVG's linearGradient, in the shape's user space.
final class SigilLinearGradient extends SigilPaint {
  /// A gradient from [from] to [to].
  const SigilLinearGradient(
    this.from,
    this.to,
    this.stops, {
    this.transform,
    this.tileMode = TileMode.clamp,
  });

  /// Where offset 0 lies.
  final Offset from;

  /// Where offset 1 lies.
  final Offset to;

  /// At least two, in offset order.
  final List<SigilStop> stops;

  /// \`gradientTransform\`, with any bounding-box units already applied.
  final List<double>? transform;

  /// SVG's \`spreadMethod\`.
  final TileMode tileMode;
}

/// SVG's radialGradient, in the shape's user space.
final class SigilRadialGradient extends SigilPaint {
  /// A gradient around [center] out to [radius].
  const SigilRadialGradient(
    this.center,
    this.radius,
    this.stops, {
    this.focal,
    this.focalRadius = 0,
    this.transform,
    this.tileMode = TileMode.clamp,
  });

  /// Center of the end circle.
  final Offset center;

  /// Radius of the end circle.
  final double radius;

  /// At least two, in offset order.
  final List<SigilStop> stops;

  /// Center of the start circle, when it is not [center].
  final Offset? focal;

  /// Radius of the start circle.
  final double focalRadius;

  /// \`gradientTransform\`, with any bounding-box units already applied.
  final List<double>? transform;

  /// SVG's \`spreadMethod\`.
  final TileMode tileMode;
}

/// Draws [icon] into a [size] box at [canvas]'s origin, centered and scaled to
/// fit like an \`<svg>\` with that width and height.
///
/// [color] replaces currentColor; [strokeWidth] (viewBox units) replaces the
/// icon's own stroke width.
void paintSigilIcon(
  Canvas canvas,
  Size size,
  SigilIconData icon, {
  required Color color,
  double? strokeWidth,
}) {
  final box = icon.viewBox;
  if (box.isEmpty || size.isEmpty) return;
  final sx = size.width / box.width;
  final sy = size.height / box.height;
  final scale = sx < sy ? sx : sy;
  canvas
    ..save()
    ..clipRect(Offset.zero & size)
    ..translate(
      (size.width - box.width * scale) / 2,
      (size.height - box.height * scale) / 2,
    )
    ..scale(scale)
    ..translate(-box.left, -box.top);
  _paintNodes(canvas, icon.nodes, color, strokeWidth ?? icon.strokeWidth);
  canvas.restore();
}

void _paintNodes(
  Canvas canvas,
  List<SigilNode> nodes,
  Color color,
  double strokeWidth,
) {
  for (final node in nodes) {
    switch (node) {
      case SigilShape():
        final path = node.path;
        final fill = node.fill;
        final blur = node.blur > 0
            ? MaskFilter.blur(BlurStyle.normal, node.blur)
            : null;
        final stroke = node.stroke;
        final width = node.strokeWidth ?? strokeWidth;
        final strokePaint = stroke == null || width <= 0
            ? null
            : (_paint(stroke, color)
                ..maskFilter = blur
                ..style = PaintingStyle.stroke
                ..strokeWidth = width
                ..strokeCap = node.strokeCap
                ..strokeJoin = node.strokeJoin
                ..strokeMiterLimit = node.strokeMiterLimit);
        if (strokePaint != null && node.strokeFirst) {
          canvas.drawPath(path, strokePaint);
        }
        if (fill != null) {
          canvas.drawPath(path, _paint(fill, color)..maskFilter = blur);
        }
        if (strokePaint != null && !node.strokeFirst) {
          canvas.drawPath(path, strokePaint);
        }
      case SigilGroup():
        canvas.save();
        final transform = node.transform;
        if (transform != null) canvas.transform(_matrix(transform).storage);
        final clip = node.clipPath;
        if (clip != null) canvas.clipPath(clip);
        final layered = node.opacity < 1;
        if (layered) {
          canvas.saveLayer(
            null,
            Paint()..color = Color.fromRGBO(0, 0, 0, node.opacity),
          );
        }
        final mask = node.mask;
        if (mask != null) canvas.saveLayer(null, Paint());
        _paintNodes(canvas, node.children, color, strokeWidth);
        if (mask != null) {
          canvas.saveLayer(
            null,
            Paint()
              ..blendMode = BlendMode.dstIn
              ..colorFilter = mask.alpha ? null : _luminanceToAlpha,
          );
          _paintNodes(canvas, mask.nodes, color, strokeWidth);
          canvas
            ..restore()
            ..restore();
        }
        if (layered) canvas.restore();
        canvas.restore();
    }
  }
}

const _luminanceToAlpha = ColorFilter.matrix([
  0, 0, 0, 0, 0, //
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
  0.2125, 0.7154, 0.0721, 0, 0,
]);

final _matrices = Expando<Matrix4>();

Matrix4 _matrix(List<double> m) => _matrices[m] ??= Matrix4(
  m[0], m[1], 0, 0, //
  m[2], m[3], 0, 0,
  0, 0, 1, 0,
  m[4], m[5], 0, 1,
);

// Gradients resolve against this rect, whose Alignment space is the user
// space itself: Alignment(x, y).withinRect(_unit) == Offset(x, y).
const _unit = Rect.fromLTRB(-1, -1, 1, 1);

class _Affine extends GradientTransform {
  const _Affine(this.m);

  final List<double>? m;

  @override
  Matrix4? transform(Rect bounds, {TextDirection? textDirection}) {
    final m = this.m;
    return m == null ? null : _matrix(m);
  }
}

Color _stopColor(SigilStop stop, Color current) =>
    stop.color ?? current.withValues(alpha: current.a * stop.alpha);

Paint _paint(SigilPaint paint, Color current) {
  final result = Paint()..isAntiAlias = true;
  switch (paint) {
    case SigilCurrentColor(:final alpha):
      result.color = current.withValues(alpha: current.a * alpha);
    case SigilSolidColor(:final color):
      result.color = color;
    case SigilLinearGradient():
      result.shader = LinearGradient(
        begin: Alignment(paint.from.dx, paint.from.dy),
        end: Alignment(paint.to.dx, paint.to.dy),
        colors: [for (final s in paint.stops) _stopColor(s, current)],
        stops: [for (final s in paint.stops) s.offset],
        tileMode: paint.tileMode,
        transform: _Affine(paint.transform),
      ).createShader(_unit);
    case SigilRadialGradient():
      final focal = paint.focal;
      // RadialGradient scales radii by the rect's shortest side, 2 here.
      result.shader = RadialGradient(
        center: Alignment(paint.center.dx, paint.center.dy),
        radius: paint.radius / 2,
        focal: focal == null ? null : Alignment(focal.dx, focal.dy),
        focalRadius: paint.focalRadius / 2,
        colors: [for (final s in paint.stops) _stopColor(s, current)],
        stops: [for (final s in paint.stops) s.offset],
        tileMode: paint.tileMode,
        transform: _Affine(paint.transform),
      ).createShader(_unit);
  }
  return result;
}

/// Paints a [SigilIconData]; pass [repaint] to redraw on a [Listenable]
/// without rebuilding.
class SigilIconPainter extends CustomPainter {
  /// Paints [icon] in [color].
  const SigilIconPainter(
    this.icon, {
    required this.color,
    this.strokeWidth,
    super.repaint,
  });

  /// The icon to paint.
  final SigilIconData icon;

  /// Replaces currentColor.
  final Color color;

  /// Replaces the icon's own stroke width, in viewBox units.
  final double? strokeWidth;

  @override
  void paint(Canvas canvas, Size size) =>
      paintSigilIcon(canvas, size, icon, color: color, strokeWidth: strokeWidth);

  @override
  bool shouldRepaint(SigilIconPainter oldDelegate) =>
      oldDelegate.icon != icon ||
      oldDelegate.color != color ||
      oldDelegate.strokeWidth != strokeWidth;
}

/// Draws an etched icon in a [size] × [size] box, like the web's
/// \`<IconHouse size={16} />\`.
///
/// - [size]: logical pixels; defaults to the ambient [IconTheme] size.
/// - [color]: replaces currentColor; defaults to the ambient text color
///   ([DefaultTextStyle]), then the [IconTheme] color.
/// - [strokeWidth]: viewBox units, like \`stroke-width\` on the web's
///   \`<svg>\`; defaults to the icon's own. Animate it for a hover cue.
class SigilIcon extends StatelessWidget {
  /// Draws [icon].
  const SigilIcon(
    this.icon, {
    super.key,
    this.size,
    this.color,
    this.strokeWidth,
    this.semanticLabel,
  });

  /// The icon to draw, such as \`iconHouse\`.
  final SigilIconData icon;

  /// The box's side in logical pixels.
  final double? size;

  /// Replaces currentColor.
  final Color? color;

  /// Replaces the icon's own stroke width, in viewBox units.
  final double? strokeWidth;

  /// Announced by screen readers; without it the icon is decorative.
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final theme = IconTheme.of(context);
    final dimension = size ?? theme.size ?? 24;
    final ink = color ??
        DefaultTextStyle.of(context).style.color ??
        theme.color ??
        const Color(0xFF000000);
    final painted = SizedBox.square(
      dimension: dimension,
      child: CustomPaint(
        painter: SigilIconPainter(icon, color: ink, strokeWidth: strokeWidth),
      ),
    );
    final label = semanticLabel;
    return label == null
        ? ExcludeSemantics(child: painted)
        : Semantics(label: label, image: true, child: painted);
  }
}
`

function renderAtlas(icons: NamedIcon[], importPath: string): string {
	const rows = icons
		.map(
			(icon) =>
				`  SigilIconAtlasItem(${dartString(icon.ref.name)}, ${dartString(dartName(icon))}, ${dartName(icon)}),`,
		)
		.join('\n')
	return `${GENERATED_MARK} — do not edit. Run \`sigil etch\` with \`atlas: true\` to regenerate.
// dart format off

${IMPORT}
import '${importPath}';

/// One icon in [SigilIconAtlas].
@immutable
final class SigilIconAtlasItem {
  /// The atlas entry for [icon].
  const SigilIconAtlasItem(this.name, this.identifier, this.icon);

  /// The icon's name in its set (\`house\`).
  final String name;

  /// Its Dart constant (\`iconHome\`).
  final String identifier;

  /// The icon itself.
  final SigilIconData icon;

  /// The manifest ref (\`lucide/house\`).
  String get ref => icon.ref;
}

/// Every etched icon, in manifest order.
const sigilIconAtlasItems = <SigilIconAtlasItem>[
${rows}
];

/// A searchable grid of every etched icon, for checking a set at a glance.
///
/// Type to filter by ref, name or constant; \`/\` or ⌘K / Ctrl+K focuses the
/// search. Tapping a tile marks it and calls [onSelect] (copy \`item.ref\` to
/// the clipboard there). Colors follow the ambient text style. Needs bounded
/// height, as any scroll view.
class SigilIconAtlas extends StatefulWidget {
  /// An atlas of [sigilIconAtlasItems].
  const SigilIconAtlas({
    super.key,
    this.title = 'Icon Atlas',
    this.iconSize = 28,
    this.onSelect,
  });

  /// The heading.
  final String title;

  /// Each tile's icon size in logical pixels.
  final double iconSize;

  /// Called with the tapped tile's item.
  final ValueChanged<SigilIconAtlasItem>? onSelect;

  @override
  State<SigilIconAtlas> createState() => _SigilIconAtlasState();
}

class _SigilIconAtlasState extends State<SigilIconAtlas> {
  final _query = TextEditingController();
  final _search = FocusNode(debugLabel: 'SigilIconAtlas search');
  String? _selected;

  @override
  void dispose() {
    _query.dispose();
    _search.dispose();
    super.dispose();
  }

  List<SigilIconAtlasItem> get _items {
    final query = _query.text.trim().toLowerCase();
    if (query.isEmpty) return sigilIconAtlasItems;
    return [
      for (final item in sigilIconAtlasItems)
        if ('\${item.ref} \${item.name} \${item.identifier} \${item.name.replaceAll('-', ' ')}'
            .toLowerCase()
            .contains(query))
          item,
    ];
  }

  void _select(SigilIconAtlasItem item) {
    setState(() => _selected = item.ref);
    widget.onSelect?.call(item);
  }

  @override
  Widget build(BuildContext context) {
    final text = DefaultTextStyle.of(context).style;
    final ink = text.color ?? const Color(0xFF111827);
    final muted = ink.withValues(alpha: 0.6);
    final line = ink.withValues(alpha: 0.14);
    final items = _items;
    final radius = BorderRadius.circular(8);

    final search = Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(border: Border.all(color: line), borderRadius: radius),
      child: Row(
        children: [
          Expanded(
            child: Stack(
              alignment: AlignmentDirectional.centerStart,
              children: [
                if (_query.text.isEmpty)
                  IgnorePointer(
                    child: Text(
                      'Search \${sigilIconAtlasItems.length} icons...',
                      style: text.copyWith(fontSize: 14, color: muted),
                    ),
                  ),
                Semantics(
                  label: 'Search icons',
                  textField: true,
                  child: EditableText(
                    controller: _query,
                    focusNode: _search,
                    style: text.copyWith(fontSize: 14, color: ink),
                    cursorColor: ink,
                    backgroundCursorColor: line,
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ],
            ),
          ),
          if (_query.text.isNotEmpty)
            GestureDetector(
              onTap: () => setState(_query.clear),
              child: Padding(
                padding: const EdgeInsets.only(left: 8),
                child: Text('Clear', style: text.copyWith(fontSize: 12, color: muted)),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(left: 8),
            child: Text('/', style: text.copyWith(fontSize: 12, color: muted)),
          ),
        ],
      ),
    );

    final header = Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.title,
            style: text.copyWith(fontSize: 20, fontWeight: FontWeight.w600, color: ink),
          ),
          const SizedBox(height: 4),
          Text(
            '\${items.length} of \${sigilIconAtlasItems.length} icons',
            style: text.copyWith(fontSize: 12, color: muted),
          ),
          const SizedBox(height: 12),
          search,
        ],
      ),
    );

    Widget tile(SigilIconAtlasItem item) {
      final selected = _selected == item.ref;
      return Semantics(
        button: true,
        selected: selected,
        label: item.ref,
        child: GestureDetector(
          onTap: () => _select(item),
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              border: Border.all(color: selected ? ink : line),
              borderRadius: radius,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SigilIcon(item.icon, size: widget.iconSize, color: ink),
                const SizedBox(height: 8),
                Text(
                  item.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: text.copyWith(fontSize: 11, color: muted),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return CallbackShortcuts(
      bindings: {
        const CharacterActivator('k', meta: true): _search.requestFocus,
        const CharacterActivator('k', control: true): _search.requestFocus,
      },
      child: Focus(
        autofocus: true,
        // \`/\` focuses the search unless it is being typed into it.
        onKeyEvent: (node, event) {
          if (event.character != '/' || _search.hasFocus) return KeyEventResult.ignored;
          _search.requestFocus();
          return KeyEventResult.handled;
        },
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: header),
            if (items.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(
                    'No icons match your search.',
                    textAlign: TextAlign.center,
                    style: text.copyWith(fontSize: 14, color: muted),
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                sliver: SliverGrid.builder(
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 112,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                  ),
                  itemCount: items.length,
                  itemBuilder: (context, index) => tile(items[index]),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
`
}

/**
 * Dart file names are lower_case_with_underscores and start with a letter;
 * icon file names arrive kebab-case and may start with a digit (`1password`).
 */
const snake = (fileName: string) =>
	(/^[0-9]/.test(fileName) ? 'icon_' : '') + fileName.replace(/-/g, '_')

export const dartRenderer: Renderer = {
	id: 'dart',
	defaultFile: 'icons.dart',
	render(icons, options) {
		const files: RenderedFile[] = [
			{
				path: 'icons.dart',
				content: [GENERATED, IMPORT, RUNTIME, ...icons.map(iconSource)].join(
					'\n',
				),
			},
		]
		if (options?.atlas) {
			files.push({
				path: options.atlasFileName ?? 'icons.atlas.dart',
				content: renderAtlas(icons, options.atlasImportPath ?? 'icons.dart'),
			})
		}
		return files
	},
	renderModules(icons) {
		const shell = {
			path: `${SHELL_FILE}.dart`,
			content: [GENERATED, IMPORT, RUNTIME].join('\n'),
		}
		const modules = icons.map((icon) => ({
			path: `${snake(icon.fileName)}.dart`,
			content: [
				GENERATED,
				`${IMPORT}\nimport '${SHELL_FILE}.dart';\n`,
				iconSource(icon),
			].join('\n'),
		}))
		const barrel = {
			path: 'index.dart',
			content:
				`${GENERATED}\nexport '${SHELL_FILE}.dart';\n` +
				modules
					.map((m) => `export '${m.path}';`)
					.sort()
					.join('\n') +
				'\n',
		}
		return [shell, ...modules, barrel]
	},
}
