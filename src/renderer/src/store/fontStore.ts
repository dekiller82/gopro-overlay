import { create } from 'zustand'

interface FontState {
  /** Real OS-installed font family names, loaded once via window.api.listSystemFonts() -- shared by
   *  the global font picker (Project Settings modal) and every widget's own per-widget dropdown so
   *  neither needs its own IPC round trip. Empty until loadSystemFonts() resolves. */
  systemFonts: string[]
  loaded: boolean
  loadSystemFonts: () => Promise<void>
}

export const useFontStore = create<FontState>((set, get) => ({
  systemFonts: [],
  loaded: false,
  loadSystemFonts: async () => {
    if (get().loaded) return
    const systemFonts = await window.api.listSystemFonts()
    set({ systemFonts, loaded: true })
  }
}))
