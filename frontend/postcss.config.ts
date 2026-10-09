// @ts-nocheck — this file is scaffolding copied into the sandbox Docker container, not executed in the monorepo
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// This file is copied into the sandbox Docker container where postcss-load-config is installed
import type { Config } from 'postcss-load-config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const config: Config = {
  plugins: {
    tailwindcss: { config: path.join(__dirname, 'tailwind.config.ts') },
    autoprefixer: {},
  },
}

export default config
