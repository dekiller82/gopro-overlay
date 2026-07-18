import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useWidgetStore } from './widgetStore'

beforeEach(() => {
  useWidgetStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('widgetStore undo/redo', () => {
  it('starts with nothing to undo/redo', () => {
    const s = useWidgetStore.getState()
    expect(s.canUndo).toBe(false)
    expect(s.canRedo).toBe(false)
  })

  it('undo reverts the most recent add, redo brings it back', () => {
    useWidgetStore.getState().addWidget('timer')
    expect(useWidgetStore.getState().widgets).toHaveLength(1)
    expect(useWidgetStore.getState().canUndo).toBe(true)

    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets).toHaveLength(0)
    expect(useWidgetStore.getState().canUndo).toBe(false)
    expect(useWidgetStore.getState().canRedo).toBe(true)

    useWidgetStore.getState().redo()
    expect(useWidgetStore.getState().widgets).toHaveLength(1)
    expect(useWidgetStore.getState().canRedo).toBe(false)
  })

  it('a new edit after undoing invalidates the old redo branch', () => {
    useWidgetStore.getState().addWidget('timer')
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().canRedo).toBe(true)

    useWidgetStore.getState().addWidget('sectorTimer')
    expect(useWidgetStore.getState().canRedo).toBe(false)
    useWidgetStore.getState().redo() // no-op, nothing to redo
    expect(useWidgetStore.getState().widgets).toHaveLength(1)
    expect(useWidgetStore.getState().widgets[0].type).toBe('sectorTimer')
  })

  // Confirmed as a real concern, not hypothetical: PropertyPanel's range/color inputs call
  // updateWidget on every onChange, which fires continuously while dragging a slider/color picker
  // -- without coalescing, one drag gesture would produce dozens of undo steps.
  it('coalesces a rapid burst of updates into a single undo step', () => {
    vi.useFakeTimers()
    useWidgetStore.getState().addWidget('speedometerDigital')
    vi.advanceTimersByTime(600) // let the add's own burst window close

    const id = useWidgetStore.getState().widgets[0].id
    for (let i = 0; i < 20; i++) {
      useWidgetStore.getState().updateWidget(id, { rotation: i })
      vi.advanceTimersByTime(50) // well under the 500ms quiet window between each
    }
    expect(useWidgetStore.getState().widgets[0].rotation).toBe(19)

    useWidgetStore.getState().undo()
    // One undo should return all the way to before the whole burst, not step back by one tick.
    expect(useWidgetStore.getState().widgets[0].rotation).toBe(0)
  })

  it('a pause between edits starts a new, separately-undoable step', () => {
    vi.useFakeTimers()
    useWidgetStore.getState().addWidget('speedometerDigital')
    vi.advanceTimersByTime(600)

    const id = useWidgetStore.getState().widgets[0].id
    useWidgetStore.getState().updateWidget(id, { rotation: 5 })
    vi.advanceTimersByTime(600) // burst window closes
    useWidgetStore.getState().updateWidget(id, { rotation: 10 })

    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets[0].rotation).toBe(5)
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets[0].rotation).toBe(0)
  })

  it('undo is a no-op when there is nothing to undo', () => {
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets).toHaveLength(0)
  })

  it('loadWidgets and reset clear the undo/redo history', () => {
    useWidgetStore.getState().addWidget('timer')
    useWidgetStore.getState().loadWidgets([])
    expect(useWidgetStore.getState().canUndo).toBe(false)
    useWidgetStore.getState().undo() // no-op
    expect(useWidgetStore.getState().widgets).toHaveLength(0)
  })

  it('applyWidgets (e.g. applying a saved layout) is undoable, unlike loadWidgets', () => {
    vi.useFakeTimers()
    useWidgetStore.getState().addWidget('timer')
    vi.advanceTimersByTime(600) // realistic gap between two distinct user actions, not one burst
    const beforeApply = useWidgetStore.getState().widgets

    useWidgetStore.getState().applyWidgets([])
    expect(useWidgetStore.getState().widgets).toHaveLength(0)
    expect(useWidgetStore.getState().canUndo).toBe(true)

    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets).toEqual(beforeApply)
  })
})
