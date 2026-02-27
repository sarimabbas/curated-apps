import { devtools } from '@tanstack/devtools-vite'
import contentCollections from '@content-collections/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

const config = defineConfig(({ mode }) => {
  const isTestMode = mode === 'test'

  return {
    plugins: [
      devtools(),
      ...(isTestMode ? [] : [contentCollections()]),
      tsconfigPaths({ projects: ['./tsconfig.json'] }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  }
})

export default config
