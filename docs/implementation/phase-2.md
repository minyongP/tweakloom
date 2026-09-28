# Phase 2: component library, detailed inspector and free movement

User-requested extension to the working editor. Execute inline on the existing feature branch and update PR #1.

## Scope and decisions

- Left panel: searchable, categorized component previews and the existing page layers. Right panel: Design / Actions / Insert tabs; the same component library is draggable from either side.
- Built-in button, dropdown, text input, divider, heading, paragraph, card and frame presets. Drag into a marked container, or click to insert into the selected container / draft board. Generated nodes belong only to the visual draft.
- Existing and inserted elements move freely using pointer dragging; X/Y controls and an optional 8px snap grid provide precision. Store CSS `translate` offsets, retaining the source layout slot instead of rewriting layout or reparenting React nodes. Right-panel flex alignment and text alignment cover structured arrangement.
- Expanded typography, dimensions, spacing, border, opacity and flex controls use a validated property allowlist.
- Actions save navigation destinations and API request specifications (method, URL, headers, JSON body, credentials reference and mock response). Test mode simulates these configurations without navigating or sending requests. Real routing/backend integration remains the coding agent's job.
- Preserve current draft schema envelope and old style/text operations. Add validated insert, interaction and dropdown-options operations. Remove dependent edits when deleting an inserted subtree.
- Replay removes/recreates only owned inserted nodes, restores owned edits, builds a source baseline, then reapplies changes. No source files or arbitrary HTML/JS are written.

## Tasks

- [x] Add failing model tests for new safe styles, insert graph, actions and unsafe input; implement shared definitions and validation.
- [x] Add browser tests for library insertion from both panels, free drag, inspector controls, dropdown options, mock actions and save/reload/Undo. Implement bridge and panels using native controls and pointer/drag events.
- [x] Run the full prior suite, inspect the actual interface, perform a focused review, document limits and update PR #1.

## Key checks

Dragging is one undoable operation, not one per pointermove. Disabled editing also blocks bridge gestures. Unknown preset/parent, duplicate IDs, unsafe links/styles and malformed API JSON fail closed. Motion tests prove coordinates survive reload; action tests prove no network request or real navigation occurs.


## Verification and review

- `npm test`: 4 passing model/store tests, including insert cycles, subtree cleanup, unsafe action/style values and inherited style keys.
- `npm run build`: TypeScript and Vite pass; no new runtime dependencies.
- `npm run test:e2e`: 11 passing Chromium tests. Includes both libraries, actual pointer drag from the right panel, exact drop position, one-step Undo, existing-element movement, 8px snap, saved coordinates, typography, dropdown options and simulated API/navigation behavior.
- Desktop browser inspection at 1600×1000: component previews and inspector verified; no page errors.
- Independent review identified inherited property names bypassing the style allowlist and quoted font-family normalization breaking repeated Apply. Both fixed with regression coverage.
- Limits: movement retains the original CSS layout slot and parent. No sibling reordering, cross-container reparenting, multi-selection or resize handles. Card internals are fixed; use separate heading/text presets inside a frame for editable compositions. API/navigation settings are specifications and mock previews only. External project adapters and agent handoff remain future work.
