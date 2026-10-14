// Generic local draft with undo/redo (docs/specs/planning-2027.md §9.2 "Editing model").
// Used by Capacity Plan and Swag Costing: edits change `draft` only; Save persists and resets.

export interface DraftHistory<T> {
  /** Last version known to be on the server. */
  saved: T;
  draft: T;
  past: T[];
  future: T[];
}

export type DraftHistoryAction<T> =
  /** Replace the draft (one undo step). Same reference = no-op. */
  | { type: "set"; draft: T }
  | { type: "undo" }
  | { type: "redo" }
  /** Discard, Reload, or after Save: start clean from `value`. Clears history. */
  | { type: "reset"; value: T };

export function initHistory<T>(value: T): DraftHistory<T> {
  return { saved: value, draft: value, past: [], future: [] };
}

export function historyReducer<T>(state: DraftHistory<T>, action: DraftHistoryAction<T>): DraftHistory<T> {
  switch (action.type) {
    case "set":
      if (action.draft === state.draft) return state;
      return { ...state, draft: action.draft, past: [...state.past, state.draft], future: [] };
    case "undo": {
      if (state.past.length === 0) return state;
      return {
        ...state,
        draft: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.draft, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { ...state, draft: next, past: [...state.past, state.draft], future: rest };
    }
    case "reset":
      return initHistory(action.value);
  }
}
