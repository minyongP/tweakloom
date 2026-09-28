# Phase 1: visual drafts

**Goal:** Select an element in a React + Vite preview, edit text and appearance without changing source, and recover a saved draft after reload.
**Architecture:** One Vite development process serves the editor and a bundled demo on separate pages. An opt-in development bridge communicates through a scoped postMessage channel. A loopback-only middleware persists one revisioned draft under `.tweakloom/`.
**Spec:** [Design](../design.md), sections 6.1, 8–9 and implementation stage 1.
**Execution:** Inline, following the user's request to start this first stage. No plugin installation, MCP, drag-and-drop, or external project support is claimed in this phase.

## Constraints

- Node.js 24+, React, TypeScript, Vite; no database or hosted service.
- First preview is the included React demo. Explicit development-only `data-tweakloom-id` attributes identify editable nodes; ambiguous or missing targets block reapplication.
- Source is never written by the editor. JSON saves use a revision check, serialized writes, atomic replacement and a previous-file backup.
- Style allowlist: text/background color, padding, border radius, font size and width; text edits apply only to leaf elements.
- Binding, origin, token, request size and data validation guard the local persistence endpoint.

## Review focus

1. Concurrent saves must return 409 rather than overwrite a newer draft (store test).
2. Corrupt saved files must be preserved and surfaced, not silently reset (store test).
3. Duplicate/missing elements or changed baseline values must produce conflicts (browser test).
4. React rerenders and iframe reloads must not destroy saved edits (browser test).
5. Forged messages, unauthorized HTTP and unsupported style data must be rejected (HTTP/browser/model checks).

## Tasks

- [x] Model and persistence: `src/shared/draft.ts`, `src/server/store.ts`, `tests/draft.test.ts`. Define `Draft`, `Operation`, `validateDraft`, `saveDraft(root, expectedRevision, draft)` and `readDraft(root)`. First prove invalid changes, concurrent writes and corrupt data fail safely; implement and pass `npm test`.
- [x] Bridge and editor: `src/bridge.ts`, `src/editor.tsx`, `src/editor.css`, `src/demo.tsx`, `src/demo.css`, `vite.config.ts`, HTML entries. Write browser expectations first for selection, color/padding/text editing, save/reload, duplicate/missing nodes and baseline conflict. Implement scoped messages and native controls. Run `npm run test:e2e`.
- [x] Verify and document: run `npm test`, `npm run build`, and `npm run test:e2e`; inspect actual UI, update README with exact startup instructions and limitations, review the branch and commit. Publish the feature branch and a reviewable PR; do not merge automatically.

## Execution record

- Initial repository contained only README, LICENSE and design document. A fresh checkout uses `feat/visual-draft-mvp`.
- Phase 1 narrows full design persistence to one draft for the bundled demo, with explicit stable IDs. This avoids inventing framework source mapping before the editing loop works.

### Verification and review

- Model/store: 2 passing Node tests covering invalid changes, concurrent revisions, backup retention and corrupt-file preservation.
- Browser: 7 passing Chromium tests covering source invariance, saved and unsaved recovery, actual Vite updates, ambiguous/missing/changed targets, message boundaries, Undo, parent/child style replay, split-chunk Korean text and pending reload protection.
- `npm run build`: TypeScript and Vite build pass. Production bundles exclude the demo bridge; the editor still needs the development draft API.
- Actual browser inspection: no page errors; verified desktop layout and element selection.
- Independent review found stale inspector values, draft-dependent inherited baselines, UTF-8 chunk decoding and a reload/edit race. Each was reproduced and fixed with regression coverage.
- Ruling: unsaved recovery uses per-tab session storage, while explicit saves use disk. This preserves work across Vite reloads without silently persisting every action; closing a tab before Save can still lose unsaved edits.
- Limit: run one writer process per checkout. This phase serializes requests within that process; cross-process file locking belongs to the later runtime lifecycle work.