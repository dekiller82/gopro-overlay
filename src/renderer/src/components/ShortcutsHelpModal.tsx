interface Props {
  isOpen: boolean
  onClose: () => void
}

const SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: ['Ctrl/⌘', 'Z'], description: 'Undo' },
  { keys: ['Ctrl/⌘', 'Shift', 'Z'], description: 'Redo (or Ctrl/⌘+Y)' },
  { keys: ['Ctrl/⌘', 'A'], description: 'Select every widget on the canvas' },
  { keys: ['Delete'], description: 'Delete the selected widget(s) (or Backspace)' },
  { keys: ['↑', '↓', '←', '→'], description: 'Nudge the selected widget(s) 1px (hold Shift for 10px)' },
  { keys: ['←', '→'], description: 'Step the video one frame back/forward, when nothing is selected' },
  { keys: ['Space'], description: 'Play / pause' },
  { keys: ['Shift', 'Click'], description: 'Add or remove a widget from the current selection' },
  { keys: ['?'], description: 'Show this panel' }
]

const GETTING_STARTED_STEPS: string[] = [
  'Import your GoPro clip(s) from the welcome screen or File → Import. Select every chapter-split part of one recording (GH010230.MP4, GH020230.MP4, ...) together and they’re stitched into a single continuous timeline.',
  'Add widgets from the Widgets tab (right panel), then drag, resize, and rotate them directly on the video frame.',
  'Set your start/finish line (Widgets tab): scrub to the exact frame you cross the line, then click "Set at current position" — this powers every lap/sector-timing widget at once.',
  'Select any widget to jump straight to its Style tab — colors, fonts, thresholds, and every other option for that widget live there.',
  'Export when you’re ready, or use "Export Best Lap" (File menu) to render just your fastest lap.'
]

/** Same overlay/panel/header/scroll chrome as WhatsNewModal, reused here for a second reference
 *  panel -- a static keyboard-shortcut cheat sheet plus a short written getting-started walkthrough
 *  (not an interactive guided tour; there was no in-app shortcut discoverability at all before this). */
function ShortcutsHelpModal({ isOpen, onClose }: Props): React.JSX.Element | null {
  if (!isOpen) return null
  return (
    <div className="whats-new__overlay" onMouseDown={onClose}>
      <div className="whats-new__panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="whats-new__header">
          <span>Keyboard Shortcuts &amp; Getting Started</span>
          <button className="whats-new__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="whats-new__scroll">
          <div className="whats-new__body">
            <h2>Keyboard Shortcuts</h2>
            <div className="shortcuts-list">
              {SHORTCUTS.map((row, i) => (
                <div className="shortcuts-list__row" key={i}>
                  <span className="shortcuts-list__keys">
                    {row.keys.map((k, j) => (
                      <kbd key={j}>{k}</kbd>
                    ))}
                  </span>
                  <span className="shortcuts-list__desc">{row.description}</span>
                </div>
              ))}
            </div>
            <h2>Getting Started</h2>
            <ol className="shortcuts-tutorial">
              {GETTING_STARTED_STEPS.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ShortcutsHelpModal
