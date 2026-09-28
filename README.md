# Tweakloom

Shape your frontend visually. Let your coding agent implement it.

Tweakloom is an open-source, local visual editing workspace being built for Codex and Claude workflows.

## Status

**Structured layout development preview.** The included React demo supports component libraries, automatic layout, drag-and-drop reordering, detailed styling and action specifications. Codex/Claude plugins, MCP handoff and external project connections are not implemented yet.

## Try the editor

Requires **Node.js 24+** and npm.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Select an element in the preview or the left-hand list. Use the Design tab to adjust typography, colors, borders, dimensions, spacing, text alignment and flex layout, then use its Apply button. These edits affect the preview only, not project source files.

- Browse searchable component previews on the left or under **Insert** on the right: button, dropdown, input, heading, paragraph, divider, card, frame (column), row and grid. Click to add to the selected container, or drag into a frame / Draft board at the desired position.
- **Arrange components** is the default: drag between components to insert or reorder; drop in the center of a frame to move inside it. A purple guide shows the insertion point. Frame edges target the parent layout. **Move earlier/later** also supports keyboard-driven reordering.
- Select a frame and choose **Row / Column / Grid**, then adjust gap, alignment, wrapping or grid columns. Children follow the frame layout. **Grid guides** displays actual cells; choose 1–4 columns and horizontal/vertical alignment at the top of the inspector. Use **Edit parent layout** from a child and **Fill width / Fit content** for sizing. Containers may restrict allowed component tags; the demo card collection accepts cards and frames.
- **Free move (advanced)** retains X/Y offsets and optional 8px snapping for earlier drafts. Existing offsets are preserved; arranging that element returns it to the layout. A drag or dropped insertion is one Undo step.
- **Actions** stores navigation destinations and API method, URL, headers, JSON body, credentials reference and mock response. **Test action** or **Preview actions** simulates the saved behavior; no page opens and no request is sent.
- **Save draft** writes a revisioned JSON file to `.tweakloom/draft.json`. The previous save is retained as `draft.backup.json`.
- Unsaved edits are cached in the current browser tab's session storage so a refresh or Vite source update can recover them. Use Save draft before closing the tab; session storage is not a durable backup.
- Top-bar **Undo / Redo** and **Ctrl/Cmd+Z**, **Ctrl/Cmd+Shift+Z** or **Ctrl+Y** work from the editor and preview. Up to 50 steps survive save and reload in the same tab; unchanged Apply does not create a step. Native text-field undo is preserved. Reload saved draft clears history; closing the tab can discard it. Individual changes can also be removed.
- **Export draft JSON** downloads the current specification. This is not yet an automated AI handoff.
- If an element disappears, its ID becomes ambiguous, or its original value changes, the editor keeps the draft and reports a conflict instead of overwriting the app.
- Use **Reload saved draft** to discard local changes and fetch the last file revision. Concurrent tabs cannot overwrite a newer saved revision silently.

The demo uses explicit development-only `data-tweakloom-id` attributes. This first build does not automatically discover arbitrary React components or map DOM nodes to source files. It targets desktop editing at 1100px or wider. Application clicks are intercepted in edit mode. Structured moves change order and parent within explicitly marked containers in the preview; they do not rewrite source. Free movement uses CSS translate offsets. Resize handles, multi-selection and automatic discovery of arbitrary component rules are not implemented. Card presets are container shells with fixed internal text. Font options use system fonts; no webfonts are downloaded.

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

See the [Phase 1 implementation record](docs/implementation/phase-1.md) and [Phase 2 implementation record](docs/implementation/phase-2.md) for implementation and verification scope. See [structured layout editing](docs/implementation/layout-editing.md) for the current default behavior.
