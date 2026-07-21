import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  disabled?: boolean
  /** Render-prop so menu items can close the menu after acting, without ToolbarMenu needing to
   *  know anything about what's inside it (plain buttons, forms, whatever). */
  children: (closeMenu: () => void) => React.ReactNode
}

/** A small "File ▾"-style dropdown menu -- click the trigger to open, click anywhere outside (or
 *  call the closeMenu callback passed to children) to close. Used to group related toolbar actions
 *  that don't need to stay permanently visible, keeping the main toolbar row from growing one
 *  button at a time as more actions get added. */
function ToolbarMenu({ label, disabled, children }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  return (
    <div className="toolbar-menu" ref={containerRef}>
      <button
        type="button"
        className="import-button import-button--ghost"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
      >
        {label} <span className="toolbar-menu__caret">▾</span>
      </button>
      {open && (
        <div className="toolbar-menu__panel" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export default ToolbarMenu
