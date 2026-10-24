import type { Renderer } from './types.ts'

import { cssRenderer } from './css.ts'
import { octaneRenderer } from './octane.ts'
import { pencilRenderer } from './pencil.ts'
import { reactRenderer } from './react.ts'
import { solidRenderer } from './solid.ts'
import { svgRenderer } from './svg.ts'
import { tsrxRenderer } from './tsrx.ts'

export const renderers: Record<string, Renderer> = {
	css: cssRenderer,
	octane: octaneRenderer,
	pencil: pencilRenderer,
	react: reactRenderer,
	solid: solidRenderer,
	tsrx: tsrxRenderer,
	svg: svgRenderer,
}
