import { FORMULA1_BOLD, FORMULA1_FONT_ID, FORMULA1_REGULAR } from '@shared/render/fonts'

interface Props {
  isOpen: boolean
  defaultFontFamily: string
  systemFonts: string[]
  onChangeDefaultFontFamily: (fontFamily: string) => void
  onClose: () => void
}

/** Whole-project settings that don't belong on any single widget -- currently just the default font,
 *  kept in its own modal (not a property-panel section) so the panel itself stays short; more
 *  project-wide settings can land here later without growing that panel further. Same overlay/panel
 *  pattern as WhatsNewModal (plain conditional div, backdrop-click closes, no portal). */
function ProjectSettingsModal({ isOpen, defaultFontFamily, systemFonts, onChangeDefaultFontFamily, onClose }: Props): React.JSX.Element | null {
  if (!isOpen) return null
  return (
    <div className="whats-new__overlay" onMouseDown={onClose}>
      <div className="whats-new__panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="whats-new__header">
          <span>Project Settings</span>
          <button className="whats-new__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="whats-new__scroll">
          <label className="field">
            <span>Default font</span>
            <select value={defaultFontFamily} onChange={(e) => onChangeDefaultFontFamily(e.target.value)}>
              <option value={FORMULA1_FONT_ID}>Formula1 — Auto (recommended)</option>
              <option value={FORMULA1_BOLD}>Formula1 Bold</option>
              <option value={FORMULA1_REGULAR}>Formula1 Regular</option>
              {systemFonts.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </label>
          <span className="field__hint">
            Applies to every widget's text by default. Any individual widget can override this with its own font, in its
            own Style panel (Style tab, once a widget is selected). "Formula1 — Auto" lets each widget mix Bold/Regular
            the way it always has (e.g. a label in Bold next to a value in Regular); picking "Formula1 Bold" or
            "Formula1 Regular" directly instead uses that one weight for everything.
          </span>
        </div>
      </div>
    </div>
  )
}

export default ProjectSettingsModal
