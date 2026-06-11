import type { Renderer } from './types.ts'

import { reactRenderer } from './react.ts'
import { solidRenderer } from './solid.ts'
import { svgRenderer } from './svg.ts'
import { tsrxRenderer } from './tsrx.ts'

export const renderers: Record<string, Renderer> = {
	react: reactRenderer,
	solid: solidRenderer,
	tsrx: tsrxRenderer,
	svg: svgRenderer,
}
