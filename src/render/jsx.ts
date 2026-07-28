/**
 * Native SVG attributes → React-shaped JSX attributes shared by the React and
 * Octane renderers. Iconify emits double-quoted attributes, so matching only
 * attribute positions avoids rewriting path data and other values.
 */
export function toJsxBody(body: string): string {
	return body
		.replace(/(\s)class="/g, '$1className="')
		.replace(/(\s)xlink:href="/g, '$1xlinkHref="')
		.replace(
			/(\s)([a-z][a-z0-9]*(?:-[a-z0-9]+)+)="/g,
			(match, space, name: string) =>
				name.startsWith('data-') || name.startsWith('aria-')
					? match
					: space +
						name.replace(/-([a-z0-9])/g, (_, character: string) =>
							character.toUpperCase(),
						) +
						'="',
		)
}
