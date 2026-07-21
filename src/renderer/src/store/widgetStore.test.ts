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

describe('widgetStore multi-select', () => {
  function addThreeWidgets(): [string, string, string] {
    useWidgetStore.getState().addWidget('timer')
    useWidgetStore.getState().addWidget('sectorTimer')
    useWidgetStore.getState().addWidget('deltaTime')
    const [a, b, c] = useWidgetStore.getState().widgets.map((w) => w.id)
    return [a, b, c]
  }

  it('a plain select replaces the whole selection with just one widget', () => {
    const [a, b] = addThreeWidgets()
    useWidgetStore.getState().selectWidget(a)
    useWidgetStore.getState().selectWidget(b)
    expect(useWidgetStore.getState().selectedId).toBe(b)
    expect(useWidgetStore.getState().selectedIds).toEqual([b])
  })

  it('shift-click (additive) adds to the selection instead of replacing it', () => {
    const [a, b] = addThreeWidgets()
    useWidgetStore.getState().selectWidget(a)
    useWidgetStore.getState().selectWidget(b, true)
    expect(useWidgetStore.getState().selectedIds).toEqual([a, b])
    expect(useWidgetStore.getState().selectedId).toBe(b) // most recently (shift-)clicked becomes primary
  })

  it('shift-clicking an already-selected member removes it from the selection', () => {
    const [a, b, c] = addThreeWidgets()
    useWidgetStore.getState().selectWidget(a)
    useWidgetStore.getState().selectWidget(b, true)
    useWidgetStore.getState().selectWidget(c, true)
    useWidgetStore.getState().selectWidget(b, true) // shift-click b again -> removed
    expect(useWidgetStore.getState().selectedIds).toEqual([a, c])
  })

  it('removing the primary via shift-click falls back to the last remaining member', () => {
    const [a, b] = addThreeWidgets()
    useWidgetStore.getState().selectWidget(a)
    useWidgetStore.getState().selectWidget(b, true) // selectedId now b
    useWidgetStore.getState().selectWidget(b, true) // shift-click b again -> removed, was primary
    expect(useWidgetStore.getState().selectedIds).toEqual([a])
    expect(useWidgetStore.getState().selectedId).toBe(a)
  })

  it('selectWidget(null) clears the selection entirely regardless of additive', () => {
    const [a, b] = addThreeWidgets()
    useWidgetStore.getState().selectWidget(a)
    useWidgetStore.getState().selectWidget(b, true)
    useWidgetStore.getState().selectWidget(null)
    expect(useWidgetStore.getState().selectedId).toBeNull()
    expect(useWidgetStore.getState().selectedIds).toEqual([])
  })

  it('selectAll selects every widget in the layout, primary set to the last one', () => {
    const [a, b, c] = addThreeWidgets()
    useWidgetStore.getState().selectWidget(a) // some prior single selection
    useWidgetStore.getState().selectAll()
    expect(useWidgetStore.getState().selectedIds).toEqual([a, b, c])
    expect(useWidgetStore.getState().selectedId).toBe(c)
  })

  it('selectAll on an empty layout is a no-op, not an empty-array selection', () => {
    useWidgetStore.getState().selectAll()
    expect(useWidgetStore.getState().selectedIds).toEqual([])
    expect(useWidgetStore.getState().selectedId).toBeNull()
  })

  it('moveWidgetsBy shifts every listed widget by the same fraction delta, leaving others untouched', () => {
    const [a, b, c] = addThreeWidgets()
    const before = Object.fromEntries(useWidgetStore.getState().widgets.map((w) => [w.id, { x: w.x, y: w.y }]))

    useWidgetStore.getState().moveWidgetsBy([a, c], 0.1, -0.05)

    const after = Object.fromEntries(useWidgetStore.getState().widgets.map((w) => [w.id, { x: w.x, y: w.y }]))
    expect(after[a].x).toBeCloseTo(before[a].x + 0.1)
    expect(after[a].y).toBeCloseTo(before[a].y - 0.05)
    expect(after[c].x).toBeCloseTo(before[c].x + 0.1)
    expect(after[c].y).toBeCloseTo(before[c].y - 0.05)
    expect(after[b]).toEqual(before[b]) // not in the moved set -- untouched
  })

  it('moveWidgetsBy is a single undo step for the whole group', () => {
    vi.useFakeTimers()
    const [a, b] = addThreeWidgets()
    vi.advanceTimersByTime(600)
    const before = useWidgetStore.getState().widgets

    useWidgetStore.getState().moveWidgetsBy([a, b], 0.2, 0.2)
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets).toEqual(before)
  })

  it('removeWidgets deletes every listed widget and prunes them from the selection', () => {
    const [a, b, c] = addThreeWidgets()
    useWidgetStore.getState().selectWidget(a)
    useWidgetStore.getState().selectWidget(b, true)
    useWidgetStore.getState().selectWidget(c, true) // all three selected, c primary

    useWidgetStore.getState().removeWidgets([a, b])

    expect(useWidgetStore.getState().widgets.map((w) => w.id)).toEqual([c])
    expect(useWidgetStore.getState().selectedIds).toEqual([c])
    expect(useWidgetStore.getState().selectedId).toBe(c)
  })

  it('removeWidgets falls back to another remaining member when the primary is deleted', () => {
    const [a, b] = addThreeWidgets()
    useWidgetStore.getState().selectWidget(a)
    useWidgetStore.getState().selectWidget(b, true) // b is primary

    useWidgetStore.getState().removeWidgets([b])

    expect(useWidgetStore.getState().selectedId).toBe(a)
    expect(useWidgetStore.getState().selectedIds).toEqual([a])
  })
})

// Regression test for a real, confirmed memory leak: undo history used to grow completely
// unbounded for the entire lifetime of the editor -- every widget click (even just selecting one,
// via bringToFront) records a history point, so a long real editing session accumulates history
// entries far faster than deliberate style edits alone would suggest. A real crash.log OOM report
// (two separate crashes ~10 minutes apart in the same session) pointed here alongside the
// useLoadedImage cache leak.
describe('widgetStore undo history cap', () => {
  it('never grows past a fixed cap, no matter how many edits are made', () => {
    vi.useFakeTimers()
    useWidgetStore.getState().addWidget('timer')
    vi.advanceTimersByTime(600)
    const id = useWidgetStore.getState().widgets[0].id

    // Each of these is its own separate burst (well past BURST_QUIET_MS apart), so each one would
    // normally add its own entry to the undo history.
    for (let i = 0; i < 500; i++) {
      useWidgetStore.getState().updateWidget(id, { rotation: i })
      vi.advanceTimersByTime(600)
    }

    // Undo repeatedly and count how many real steps exist -- if the cap works, this stops well
    // short of 500 (the cap, not the edit count, bounds how far back undo can go).
    let undoSteps = 0
    while (useWidgetStore.getState().canUndo && undoSteps <= 500) {
      useWidgetStore.getState().undo()
      undoSteps++
    }
    expect(undoSteps).toBeLessThan(500)
    expect(undoSteps).toBeLessThanOrEqual(200)
  })
})
