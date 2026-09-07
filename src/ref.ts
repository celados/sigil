export type IconRef = { set: string; name: string }

// 与 Iconify 的 matchIconName 同源:小写字母数字 + 连字符
const PART = '[a-z0-9]+(?:-[a-z0-9]+)*'
const REF_RE = new RegExp(`^(${PART})/(${PART})$`)

export function parseRef(input: string): IconRef {
	const m = REF_RE.exec(input)
	if (!m) {
		throw new Error(`invalid ref "${input}" — expected <set>/<name>`)
	}
	return { set: m[1]!, name: m[2]! }
}

export function formatRef(ref: IconRef): string {
	return `${ref.set}/${ref.name}`
}

export function pascalCase(name: string): string {
	return name
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('')
}

export function kebabCase(name: string): string {
	return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}
