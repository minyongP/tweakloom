# Tweakloom

Shape your frontend visually. Let your coding agent implement it.

Tweakloom is an open-source, local visual editing workspace being built for Codex and Claude workflows.

## Status

**Phase 1 development preview.** A working editor for the included React demo is available. Codex/Claude plugins, MCP handoff, drag-and-drop and external project connections are not implemented yet.

## Try the editor

Requires **Node.js 24+** and npm.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Select an element in the preview or the left-hand list. Adjust text, colors, padding, corner radius, font size or width, then use its Apply button. These edits affect the preview only, not project source files.

- **Save draft** writes a revisioned JSON file to `.tweakloom/draft.json`. The previous save is retained as `draft.backup.json`.
- Unsaved edits are cached in the current browser tab's session storage so a refresh or Vite source update can recover them. Use Save draft before closing the tab; session storage is not a durable backup.
- **Undo** reverses up to 50 edits within the open editor. Individual changes can also be removed.
- **Export draft JSON** downloads the current specification. This is not yet an automated AI handoff.
- If an element disappears, its ID becomes ambiguous, or its original value changes, the editor keeps the draft and reports a conflict instead of overwriting the app.
- Use **Reload saved draft** to discard local changes and fetch the last file revision. Concurrent tabs cannot overwrite a newer saved revision silently.

The demo uses explicit development-only `data-tweakloom-id` attributes. This first build does not automatically discover arbitrary React components or map DOM nodes to source files. It targets desktop editing at 1050px or wider. Application clicks are intercepted in edit mode; interaction authoring is a later phase.

The local service only binds to loopback and guards draft requests with a per-process token and origin checks. Run one development server per checkout; multiple tabs are supported, multiple writer processes are not. Do not expose the Vite server to the internet. `.tweakloom/` is gitignored; inspect drafts before sharing because visible text can contain private information.

## Checks

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests use port 5174 and isolated draft storage. One test temporarily changes and restores `src/demo.tsx` to exercise actual Vite updates; avoid editing that file while the tests run. `npm run build` verifies types and browser bundles, but the editor currently requires the development server's draft API; `dist/` alone is not a deployable editor.

## Intended workflow

1. Preview a frontend project in a local web editor.
2. Select elements and adjust text, appearance, spacing, and layout.
3. Drag and drop components and describe interactions.
4. Save the proposed changes as a structured change specification with visual references.
5. Ask Codex or Claude to implement the specification in the project's source code.
6. Preview the result and verify that it matches the intended design.

Visual edits are intended to remain a draft until handed off to the coding agent. Interaction previews describe intended behavior; production API connections and application logic still require implementation and verification.

## Planned scope

- Live frontend preview and element selection
- Appearance and layout controls
- Component insertion and drag-and-drop reordering
- Interaction specifications and previews
- Structured handoff to Codex and Claude
- Undo and comparison of intended versus implemented results

React + Vite is the included test project. Next.js, Vue and arbitrary external React projects remain future integration targets.

## Design direction

A shared local web editor with a proposed MCP bridge and tool-specific plugin packaging. AI implementation should use the user's existing coding agent; Tweakloom should not require a separate hosted AI service account. Existing agent subscription and usage costs remain separate.

## License

[MIT](LICENSE)

## Design

See the [design document (Korean)](docs/design.md) for the proposed architecture, editing scope, AI handoff contract, and acceptance criteria. This is a review draft, not an implemented feature list.

See the [Phase 1 implementation record](docs/implementation/phase-1.md) for the current milestone and verification scope.
