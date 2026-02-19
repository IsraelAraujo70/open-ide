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
