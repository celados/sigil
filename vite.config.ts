import { harness } from '@celados/harness'
import { defineConfig } from 'vite-plus'

// `fixtures/` is test input (icon CSS/HTML samples), not source.
export default defineConfig(harness({ ignore: ['dist/**', 'fixtures/**'] }))
