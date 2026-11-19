import type { Element } from '../svg-attrs.ts'

/**
 * SVG geometry shared by the renderers that cannot emit SVG (pencil, dart):
 * every basic shape as path data, path data as absolute commands, transforms
 * as affine matrices.
 */

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g

export const attr = (el: Element, name: string): string | undefined =>
	el.attrs.find(([k]) => k === name)?.[1]

const num = (el: Element, name: string) => Number(attr(el, name) ?? 0)

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
	const has = (k: string) => attr(el, k) !== undefined
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

/** Attributes that are geometry, per shape tag. */
export const GEOMETRY: Record<string, string[]> = {
	path: ['d'],
	circle: ['cx', 'cy', 'r'],
	ellipse: ['cx', 'cy', 'rx', 'ry'],
	rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
	line: ['x1', 'y1', 'x2', 'y2'],
	polyline: ['points'],
	polygon: ['points'],
}

/** Any basic shape as path data. */
export function shapePath(el: Element): string {
	switch (el.tag) {
		case 'path':
			return absoluteStart(attr(el, 'd') ?? '')
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
			return pointsPath(attr(el, 'points') ?? '', el.tag === 'polygon')
	}
}

/** Absolute path commands: H/V become L, S/T become C/Q with the reflected control point. */
export type Command =
	| { k: 'M' | 'L'; x: number; y: number }
	| {
			k: 'C'
			x1: number
			y1: number
			x2: number
			y2: number
			x: number
			y: number
	  }
	| { k: 'Q'; x1: number; y1: number; x: number; y: number }
	| {
			k: 'A'
			rx: number
			ry: number
			rotation: number
			large: boolean
			sweep: boolean
			x: number
			y: number
	  }
	| { k: 'Z' }

const ARITY: Record<string, number> = {
	m: 2,
	l: 2,
	h: 1,
	v: 1,
	c: 6,
	s: 4,
	q: 4,
	t: 2,
	a: 7,
	z: 0,
}
const NUMBER_AT = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y

/** Path data → absolute commands, following the SVG grammar (implicit repeats, packed arc flags). */
export function parsePath(d: string): Command[] {
	const out: Command[] = []
	let i = 0
	let cmd = ''
	let x = 0
	let y = 0
	let startX = 0
	let startY = 0
	// The previous command's last control point, for S and T.
	let cx: number | undefined
	let cy: number | undefined
	let prev = ''

	const skip = () => {
		while (i < d.length && /[\s,]/.test(d[i]!)) i++
	}
	const number = (): number => {
		skip()
		NUMBER_AT.lastIndex = i
		const m = NUMBER_AT.exec(d)
		if (!m) throw new Error(`malformed path data near "${d.slice(i, i + 12)}"`)
		i = NUMBER_AT.lastIndex
		return Number(m[0])
	}
	const flag = (): boolean => {
		skip()
		const c = d[i++]
		if (c !== '0' && c !== '1')
			throw new Error(`malformed arc flag in path data`)
		return c === '1'
	}

	for (;;) {
		skip()
		if (i >= d.length) break
		const c = d[i]!
		if (/[a-zA-Z]/.test(c)) {
			if (!(c.toLowerCase() in ARITY))
				throw new Error(`unknown path command "${c}"`)
			cmd = c
			i++
		} else if (!cmd) {
			throw new Error('path data must start with a command')
		}
		const lower = cmd.toLowerCase()
		const rel = cmd !== cmd.toUpperCase()
		const ox = rel ? x : 0
		const oy = rel ? y : 0
		switch (lower) {
			case 'm': {
				x = ox + number()
				y = oy + number()
				startX = x
				startY = y
				out.push({ k: 'M', x, y })
				// Coordinates after a moveto are implicit linetos.
				cmd = rel ? 'l' : 'L'
				break
			}
			case 'l':
			case 'h':
			case 'v': {
				if (lower === 'h') x = ox + number()
				else if (lower === 'v') y = oy + number()
				else {
					x = ox + number()
					y = oy + number()
				}
				out.push({ k: 'L', x, y })
				break
			}
			case 'c':
			case 's': {
				let x1: number
				let y1: number
				if (lower === 'c') {
					x1 = ox + number()
					y1 = oy + number()
				} else {
					const smooth = prev === 'c' || prev === 's'
					x1 = smooth ? 2 * x - cx! : x
					y1 = smooth ? 2 * y - cy! : y
				}
				const x2 = ox + number()
				const y2 = oy + number()
				x = ox + number()
				y = oy + number()
				out.push({ k: 'C', x1, y1, x2, y2, x, y })
				cx = x2
				cy = y2
				break
			}
			case 'q':
			case 't': {
				let x1: number
				let y1: number
				if (lower === 'q') {
					x1 = ox + number()
					y1 = oy + number()
				} else {
					const smooth = prev === 'q' || prev === 't'
					x1 = smooth ? 2 * x - cx! : x
					y1 = smooth ? 2 * y - cy! : y
				}
				x = ox + number()
				y = oy + number()
				out.push({ k: 'Q', x1, y1, x, y })
				cx = x1
				cy = y1
				break
			}
			case 'a': {
				const rx = Math.abs(number())
				const ry = Math.abs(number())
				const rotation = number()
				const large = flag()
				const sweep = flag()
				x = ox + number()
				y = oy + number()
				out.push({ k: 'A', rx, ry, rotation, large, sweep, x, y })
				break
			}
			case 'z': {
				x = startX
				y = startY
				out.push({ k: 'Z' })
				break
			}
		}
		prev = lower
	}
	return out
}

/**
 * Tight bounds of the geometry (control points excluded), which SVG's
 * objectBoundingBox units resolve against.
 */
export function pathBounds(cmds: Command[]): [number, number, number, number] {
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	const add = (px: number, py: number) => {
		minX = Math.min(minX, px)
		minY = Math.min(minY, py)
		maxX = Math.max(maxX, px)
		maxY = Math.max(maxY, py)
	}
	let x = 0
	let y = 0
	let sx = 0
	let sy = 0
	const STEPS = 64
	for (const c of cmds) {
		switch (c.k) {
			case 'M':
				sx = c.x
				sy = c.y
				add(c.x, c.y)
				break
			case 'L':
				add(c.x, c.y)
				break
			case 'C':
				for (let s = 1; s <= STEPS; s++) {
					const t = s / STEPS
					const u = 1 - t
					add(
						u * u * u * x +
							3 * u * u * t * c.x1 +
							3 * u * t * t * c.x2 +
							t * t * t * c.x,
						u * u * u * y +
							3 * u * u * t * c.y1 +
							3 * u * t * t * c.y2 +
							t * t * t * c.y,
					)
				}
				break
			case 'Q':
				for (let s = 1; s <= STEPS; s++) {
					const t = s / STEPS
					const u = 1 - t
					add(
						u * u * x + 2 * u * t * c.x1 + t * t * c.x,
						u * u * y + 2 * u * t * c.y1 + t * t * c.y,
					)
				}
				break
			case 'A':
				for (const [px, py] of arcPoints(x, y, c, STEPS)) add(px, py)
				break
			case 'Z':
				x = sx
				y = sy
				continue
		}
		x = c.x
		y = c.y
	}
	if (minX === Infinity) return [0, 0, 0, 0]
	return [minX, minY, maxX - minX, maxY - minY]
}

/** Points along an SVG arc (endpoint → center parameterization, SVG 1.1 F.6.5). */
function arcPoints(
	x1: number,
	y1: number,
	a: Extract<Command, { k: 'A' }>,
	steps: number,
): [number, number][] {
	let { rx, ry } = a
	if (!rx || !ry || (x1 === a.x && y1 === a.y)) return [[a.x, a.y]]
	const phi = (a.rotation * Math.PI) / 180
	const cos = Math.cos(phi)
	const sin = Math.sin(phi)
	const dx = (x1 - a.x) / 2
	const dy = (y1 - a.y) / 2
	const x1p = cos * dx + sin * dy
	const y1p = -sin * dx + cos * dy
	const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
	if (lambda > 1) {
		rx *= Math.sqrt(lambda)
		ry *= Math.sqrt(lambda)
	}
	const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
	const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
	const coef =
		(a.large === a.sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den))
	const cxp = (coef * rx * y1p) / ry
	const cyp = (-coef * ry * x1p) / rx
	const cx = cos * cxp - sin * cyp + (x1 + a.x) / 2
	const cy = sin * cxp + cos * cyp + (y1 + a.y) / 2
	const angle = (ux: number, uy: number, vx: number, vy: number) =>
		Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
	const theta = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
	let delta = angle(
		(x1p - cxp) / rx,
		(y1p - cyp) / ry,
		(-x1p - cxp) / rx,
		(-y1p - cyp) / ry,
	)
	if (!a.sweep && delta > 0) delta -= 2 * Math.PI
	if (a.sweep && delta < 0) delta += 2 * Math.PI
	const points: [number, number][] = []
	for (let s = 1; s <= steps; s++) {
		const t = theta + (delta * s) / steps
		const ex = rx * Math.cos(t)
		const ey = ry * Math.sin(t)
		points.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy])
	}
	return points
}

/** 2D affine `[a, b, c, d, e, f]`, as in SVG's `matrix(a b c d e f)`. */
export type Affine = [number, number, number, number, number, number]

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0]

/** `m · n`: apply n first, then m. */
export function multiply(m: Affine, n: Affine): Affine {
	return [
		m[0] * n[0] + m[2] * n[1],
		m[1] * n[0] + m[3] * n[1],
		m[0] * n[2] + m[2] * n[3],
		m[1] * n[2] + m[3] * n[3],
		m[0] * n[4] + m[2] * n[5] + m[4],
		m[1] * n[4] + m[3] * n[5] + m[5],
	]
}

export function isIdentity(m: Affine): boolean {
	return m.every((v, i) => Math.abs(v - IDENTITY[i]!) < 1e-12)
}

/** SVG transform list → one matrix. */
export function parseTransform(value: string): Affine {
	let m = IDENTITY
	const FN = /([a-zA-Z]+)\s*\(([^)]*)\)/g
	const rest = value.replace(FN, '').replace(/[\s,]/g, '')
	if (rest) throw new Error(`malformed transform "${value}"`)
	for (const [, name, args] of value.matchAll(FN)) {
		const n = (args!.match(NUMBER) ?? []).map(Number)
		const rad = ((n[0] ?? 0) * Math.PI) / 180
		let t: Affine
		switch (name) {
			case 'matrix':
				if (n.length !== 6) throw new Error(`malformed transform "${value}"`)
				t = n as Affine
				break
			case 'translate':
				t = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]
				break
			case 'scale':
				t = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]
				break
			case 'rotate': {
				const r: Affine = [
					Math.cos(rad),
					Math.sin(rad),
					-Math.sin(rad),
					Math.cos(rad),
					0,
					0,
				]
				const [px = 0, py = 0] = n.slice(1)
				t = multiply(multiply([1, 0, 0, 1, px, py], r), [1, 0, 0, 1, -px, -py])
				break
			}
			case 'skewX':
				t = [1, 0, Math.tan(rad), 1, 0, 0]
				break
			case 'skewY':
				t = [1, Math.tan(rad), 0, 1, 0, 0]
				break
			default:
				throw new Error(`transform "${name}" is not supported`)
		}
		m = multiply(m, t)
	}
	return m
}
