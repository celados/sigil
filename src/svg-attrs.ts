/**
 * 把描边/填充语义从 body 提升到根 <svg>。
 *
 * 为什么:CSS 只能写在 <svg> 上(`svg { stroke-width: 2 }`),而 presentation
 * 属性写在子元素上会挡住继承——内层 <g stroke-width="2"> 让线宽的 CSS 覆盖静默
 * 失效。提升后子元素只靠继承,根属性又是最低优先级,CSS 与 props 都能覆盖。
 *
 * 规则(全部无损):
 *
 * 1. 只带 presentation 属性的单个顶层 <g> 解包,属性挪到根。
 * 2. 所有可绘制元素显式写了同一个值的属性,提升到根。
 * 3. 与继承值相同的子元素属性删除;不同的(必要信息)保留。
 * 4. Stroke="none" + fill="none" 的元素不绘制任何东西(tabler 的 24×24 占位框),删除。 只提升 body
 *    里已有的属性,填充型图标因此不会被描边属性污染。
 */

export const PRESENTATION_ATTRS = [
	'fill',
	'stroke',
	'stroke-width',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-miterlimit',
] as const

const HOISTABLE = new Set<string>(PRESENTATION_ATTRS)
const SHAPES = new Set([
	'path',
	'circle',
	'ellipse',
	'line',
	'polyline',
	'polygon',
	'rect',
])

type Attr = [name: string, value: string]
type Element = { tag: string; attrs: Attr[]; children: Node[] }
type Node = Element | string

const TOKEN =
	/<!--[\s\S]*?-->|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|[^<]+/g
const ATTR = /([\w:-]+)="([^"]*)"/g

/** Iconify 归一化后的 body 只有双引号属性,无需完整 XML 解析器 */
function parse(body: string): Node[] {
	const root: Element = { tag: '#root', attrs: [], children: [] }
	const stack = [root]
	for (const m of body.matchAll(TOKEN)) {
		const top = stack[stack.length - 1]!
		const [raw, close, open, attrs, selfClose] = m
		if (raw.startsWith('<!--')) continue
		if (close) {
			if (top.tag !== close) throw new Error(`unbalanced </${close}> in body`)
			stack.pop()
		} else if (open) {
			const el: Element = {
				tag: open,
				attrs: [...(attrs ?? '').matchAll(ATTR)].map(
					([, k, v]) => [k!, v!] as Attr,
				),
				children: [],
			}
			top.children.push(el)
			if (!selfClose) stack.push(el)
		} else if (raw.trim()) {
			top.children.push(raw)
		}
	}
	if (stack.length !== 1) throw new Error('unclosed element in body')
	return root.children
}

function serialize(nodes: Node[]): string {
	return nodes
		.map((node) => {
			if (typeof node === 'string') return node
			const attrs = node.attrs.map(([k, v]) => ` ${k}="${v}"`).join('')
			return node.children.length
				? `<${node.tag}${attrs}>${serialize(node.children)}</${node.tag}>`
				: `<${node.tag}${attrs}/>`
		})
		.join('')
}

const get = (el: Element, name: string) =>
	el.attrs.find(([k]) => k === name)?.[1]

function isInvisible(el: Element): boolean {
	return (
		SHAPES.has(el.tag) &&
		get(el, 'stroke') === 'none' &&
		get(el, 'fill') === 'none'
	)
}

function dropInvisible(nodes: Node[]): Node[] {
	return nodes
		.filter((n) => typeof n === 'string' || !isInvisible(n))
		.map((n) =>
			typeof n === 'string' ? n : { ...n, children: dropInvisible(n.children) },
		)
}

function shapes(nodes: Node[]): Element[] {
	return nodes.flatMap((n) =>
		typeof n === 'string'
			? []
			: [...(SHAPES.has(n.tag) ? [n] : []), ...shapes(n.children)],
	)
}

function stripInherited(nodes: Node[], inherited: Map<string, string>): Node[] {
	return nodes.map((n) => {
		if (typeof n === 'string') return n
		const attrs = n.attrs.filter(
			([k, v]) => !(HOISTABLE.has(k) && inherited.get(k) === v),
		)
		const next = new Map(inherited)
		for (const [k, v] of attrs) if (HOISTABLE.has(k)) next.set(k, v)
		return { ...n, attrs, children: stripInherited(n.children, next) }
	})
}

export function hoistPresentation(body: string): {
	body: string
	attrs: Record<string, string>
} {
	let nodes = dropInvisible(parse(body))
	const root = new Map<string, string>()

	// 1. 解包只带 presentation 属性的单个顶层 <g>
	for (;;) {
		const [only, ...rest] = nodes
		if (
			rest.length > 0 ||
			!only ||
			typeof only === 'string' ||
			only.tag !== 'g' ||
			!only.attrs.every(([k]) => HOISTABLE.has(k) && !root.has(k))
		) {
			break
		}
		for (const [k, v] of only.attrs) root.set(k, v)
		nodes = only.children
	}

	// 2. 所有可绘制元素一致显式声明的属性提升到根
	const all = shapes(nodes)
	if (all.length > 0) {
		for (const name of PRESENTATION_ATTRS) {
			if (root.has(name)) continue
			const first = get(all[0]!, name)
			if (first !== undefined && all.every((el) => get(el, name) === first)) {
				root.set(name, first)
			}
		}
	}

	// 3. 删除与继承值相同的属性
	nodes = stripInherited(nodes, root)

	const attrs: Record<string, string> = {}
	for (const name of PRESENTATION_ATTRS) {
		const value = root.get(name)
		if (value !== undefined) attrs[name] = value
	}
	return { body: serialize(nodes), attrs }
}
