# Component requests

The preview exposes **Ask AI** for a selected element. **New component** targets the selected container, its parent or the draft board. Requests pin a target snapshot so subsequent selection does not redirect a pending request.

Requests are validated draft operations with unique IDs, creation/modification intent, instructions and target context (ID, tag, text, styles, parent and container rules). Existing revision checks, session recovery, Undo/Redo and insertion cleanup apply. Missing targets, tag changes and lost creation containers block export without deleting requests.

The Requests tab supports adding, editing and removing requests. Copy/download produces a Markdown snapshot containing all requests and visual operations. Clipboard failure offers selectable text. Page context is identified as data; sourceFiles is deliberately empty because source mapping is not implemented.

This feature does not run an AI task, rewrite source or register a plugin. A user can pass the snapshot to Codex or Claude. A future plugin can expose saved requests through MCP; browser-triggered agent execution requires a separate integration.

Validation: 6 model/store tests, 23 Chromium browser tests and TypeScript/Vite build passed. Request coverage includes save/reload, target pinning, editing, Undo, creation, session recovery, download contents, clipboard and missing-target export blocking. Desktop visual inspection at 1600x1000 reported no page errors.
