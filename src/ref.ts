export type IconRef = { set: string; name: string }

// 与 Iconify 的 matchIconName 同源:小写字母数字 + 连字符
const PART = '[a-z0-9]+(?:-[a-z0-9]+)*'
const REF_RE = new RegExp(`^(${PART})[/:](${PART})$`)

export function parseRef(input: string): IconRef {
	const m = REF_RE.exec(input)
	if (!m) {
		throw new Error(
			`invalid ref "${input}" — expected <set>/<name>; DSL: "+" joins icons, "," separates sets (lucide/a+b,mdi/c)`,
		)
	}
	return { set: m[1]!, name: m[2]! }
}

/**
 * Ref DSL:`,`(或空格,即多个参数)分库,`+` 分图标。 `lucide/a+b,mdi/c` → lucide/a lucide/b
 * mdi/c。 每个 `,` 段自包含(必须带 set/),不做"继承上文 set"的隐式规则。
 */
export function expandRefArgs(args: string[]): string[] {
	return args
		.flatMap((arg) => arg.split(','))
		.filter(Boolean)
		.flatMap((group) => {
			const slash = group.search(/[/:]/)
			if (slash === -1) return [group] // 缺 set/,交给 parseRef 报错
			const set = group.slice(0, slash)
			return group
				.slice(slash + 1)
				.split('+')
				.filter(Boolean)
				.map((name) => `${set}/${name}`)
		})
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
