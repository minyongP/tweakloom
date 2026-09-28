# Tweakloom

Shape your frontend visually. Let your coding agent implement it.

Tweakloom is a planned open-source, local visual editing workspace for Codex and Claude workflows.

## Status

**Planning stage. No working editor or installable plugin is available yet.**

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

React, Next.js, and Vue are target use cases, not currently supported integrations. The initial framework and integration details are not finalized.

## Design direction

A shared local web editor with a proposed MCP bridge and tool-specific plugin packaging. AI implementation should use the user's existing coding agent; Tweakloom should not require a separate hosted AI service account. Existing agent subscription and usage costs remain separate.

## License

[MIT](LICENSE)