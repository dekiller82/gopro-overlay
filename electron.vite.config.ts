import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    // react-draggable (a react-rnd dependency) reads `process.env.DRAGGABLE_DEBUG` with no guard.
    // The renderer has no Node `process` global, so that throws "process is not defined" the
    // moment any widget mounts. Stub it out so the bare property access resolves to `undefined`
    // instead of throwing.
    define: {
      'process.env': JSON.stringify({})
    },
    plugins: [react()]
  }
})
