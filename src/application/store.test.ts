import { describe, expect, it } from "bun:test"

import { appReducer, createInitialState } from "./store.ts"

describe("appReducer - file picker", () => {
  it("opens file picker in file mode and moves focus to palette by default", () => {
    const state = createInitialState()

    const next = appReducer(state, { type: "OPEN_FILE_PICKER" })

    expect(next.filePicker).toEqual({ isOpen: true, mode: "file" })
    expect(next.focusTarget).toBe("palette")
  })

  it("opens file picker in project mode when requested", () => {
    const state = createInitialState()

    const next = appReducer(state, { type: "OPEN_FILE_PICKER", mode: "project" })

    expect(next.filePicker).toEqual({ isOpen: true, mode: "project" })
    expect(next.focusTarget).toBe("palette")
  })

  it("closes file picker and returns focus to editor", () => {
    const opened = appReducer(createInitialState(), { type: "OPEN_FILE_PICKER", mode: "project" })

    const next = appReducer(opened, { type: "CLOSE_FILE_PICKER" })

    expect(next.filePicker).toEqual({ isOpen: false, mode: "file" })
    expect(next.focusTarget).toBe("editor")
  })
})

describe("appReducer - palette focus transitions", () => {
  it("opens palette with clean state and focuses palette", () => {
    const state = createInitialState()

    const next = appReducer(state, { type: "OPEN_PALETTE" })

    expect(next.palette).toEqual({ isOpen: true, query: "", items: [] })
    expect(next.focusTarget).toBe("palette")
  })

  it("closes palette and focuses editor when no other overlay is open", () => {
    const opened = appReducer(createInitialState(), { type: "OPEN_PALETTE" })

    const next = appReducer(opened, { type: "CLOSE_PALETTE" })

    expect(next.palette).toEqual({ isOpen: false, query: "", items: [] })
    expect(next.focusTarget).toBe("editor")
  })

  it("keeps focus on command line when palette closes and command line is open", () => {
    const state = {
      ...createInitialState(),
      palette: { isOpen: true, query: "q", items: [] },
      commandLine: { isOpen: true, value: ":w" },
    }

    const next = appReducer(state, { type: "CLOSE_PALETTE" })

    expect(next.focusTarget).toBe("commandLine")
  })

  it("keeps palette focus when file picker is open", () => {
    const state = {
      ...createInitialState(),
      palette: { isOpen: true, query: "q", items: [] },
      filePicker: { isOpen: true, mode: "file" as const },
    }

    const next = appReducer(state, { type: "CLOSE_PALETTE" })

    expect(next.focusTarget).toBe("palette")
  })

  it("keeps palette focus when theme picker is open", () => {
    const state = {
      ...createInitialState(),
      palette: { isOpen: true, query: "q", items: [] },
      themePicker: { isOpen: true },
    }

    const next = appReducer(state, { type: "CLOSE_PALETTE" })

    expect(next.focusTarget).toBe("palette")
  })

  it("keeps palette focus when keybindings help is open", () => {
    const state = {
      ...createInitialState(),
      palette: { isOpen: true, query: "q", items: [] },
      keybindingsHelp: { isOpen: true },
    }

    const next = appReducer(state, { type: "CLOSE_PALETTE" })

    expect(next.focusTarget).toBe("palette")
  })
})

describe("appReducer - diagnostics", () => {
  it("sets diagnostics for existing buffers", () => {
    const opened = appReducer(createInitialState(), {
      type: "OPEN_FILE",
      path: "/tmp/example.ts",
      content: "const value: string = 123",
    })

    const bufferId = Array.from(opened.buffers.keys())[0]
    expect(bufferId).toBeDefined()

    if (!bufferId) {
      throw new Error("Buffer should exist")
    }

    const next = appReducer(opened, {
      type: "SET_BUFFER_DIAGNOSTICS",
      bufferId,
      diagnostics: [
        {
          range: {
            start: { line: 0, column: 0, offset: 0 },
            end: { line: 0, column: 5, offset: 5 },
          },
          severity: "error",
          message: "Type mismatch",
          source: "ts",
          code: 2322,
        },
      ],
    })

    expect(next.diagnostics.get(bufferId)?.length).toBe(1)
    expect(next.diagnostics.get(bufferId)?.[0]?.message).toBe("Type mismatch")
  })

  it("ignores diagnostics for unknown buffers", () => {
    const state = createInitialState()
    const next = appReducer(state, {
      type: "SET_BUFFER_DIAGNOSTICS",
      bufferId: "missing",
      diagnostics: [],
    })

    expect(next).toBe(state)
    expect(next.diagnostics.size).toBe(0)
  })

  it("clears diagnostics for a specific buffer", () => {
    const opened = appReducer(createInitialState(), {
      type: "OPEN_FILE",
      path: "/tmp/example.ts",
      content: "const value: string = 123",
    })

    const bufferId = Array.from(opened.buffers.keys())[0]
    expect(bufferId).toBeDefined()

    if (!bufferId) {
      throw new Error("Buffer should exist")
    }

    const withDiagnostics = appReducer(opened, {
      type: "SET_BUFFER_DIAGNOSTICS",
      bufferId,
      diagnostics: [
        {
          range: {
            start: { line: 0, column: 0, offset: 0 },
            end: { line: 0, column: 5, offset: 5 },
          },
          severity: "warning",
          message: "Unused value",
        },
      ],
    })

    const cleared = appReducer(withDiagnostics, {
      type: "CLEAR_BUFFER_DIAGNOSTICS",
      bufferId,
    })

    expect(cleared.diagnostics.has(bufferId)).toBe(false)
  })

  it("removes diagnostics when closing the last tab for a buffer", () => {
    const opened = appReducer(createInitialState(), {
      type: "OPEN_FILE",
      path: "/tmp/example.ts",
      content: "const value: string = 123",
    })

    const bufferId = Array.from(opened.buffers.keys())[0]
    const pane = opened.layout.root.type === "leaf" ? opened.layout.root.pane : null
    const tabId = pane?.activeTabId

    expect(bufferId).toBeDefined()
    expect(tabId).toBeDefined()

    if (!bufferId || !tabId) {
      throw new Error("Buffer and tab should exist")
    }

    const withDiagnostics = appReducer(opened, {
      type: "SET_BUFFER_DIAGNOSTICS",
      bufferId,
      diagnostics: [
        {
          range: {
            start: { line: 0, column: 0, offset: 0 },
            end: { line: 0, column: 5, offset: 5 },
          },
          severity: "error",
          message: "Type mismatch",
        },
      ],
    })

    const closed = appReducer(withDiagnostics, {
      type: "CLOSE_TAB",
      tabId,
    })

    expect(closed.buffers.has(bufferId)).toBe(false)
    expect(closed.diagnostics.has(bufferId)).toBe(false)
  })

  it("clears all diagnostics on CLOSE_ALL_TABS", () => {
    const opened = appReducer(createInitialState(), {
      type: "OPEN_FILE",
      path: "/tmp/example.ts",
      content: "const value: string = 123",
    })

    const bufferId = Array.from(opened.buffers.keys())[0]
    expect(bufferId).toBeDefined()

    if (!bufferId) {
      throw new Error("Buffer should exist")
    }

    const withDiagnostics = appReducer(opened, {
      type: "SET_BUFFER_DIAGNOSTICS",
      bufferId,
      diagnostics: [
        {
          range: {
            start: { line: 0, column: 0, offset: 0 },
            end: { line: 0, column: 5, offset: 5 },
          },
          severity: "info",
          message: "Info message",
        },
      ],
    })

    const closed = appReducer(withDiagnostics, { type: "CLOSE_ALL_TABS" })

    expect(closed.buffers.size).toBe(0)
    expect(closed.diagnostics.size).toBe(0)
  })
})
