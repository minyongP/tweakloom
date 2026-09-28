# Structured component layout

The user requested code-defined components that naturally arrange themselves when added or moved. The existing editor now defaults to layout placement instead of coordinate offsets.

- Drag between siblings to reorder or insert. Drop into the center of a frame to change parent; a 12px edge targets its parent. A purple guide marks the candidate position. Move earlier/later buttons offer keyboard-accessible ordering.
- Frame, Row and Grid presets use native CSS layout. Row wraps by default; Column stacks; Grid uses configurable equal columns. The inspector exposes gap, wrapping, distribution and alignment.
- Only marked containers accept drops. An optional `data-tweakloom-accept` tag allowlist enforces component structure at both interaction and replay boundaries. The demo collection accepts article/div children.
- Moves are validated draft operations. Existing source nodes retain their original parent baseline, and owned structural changes restore before replay. Removing an inserted container restores source nodes moved inside it. Inserted subtree deletion cleans dependent moves and anchors.
- New structural moves remove that element's draft translate offset. Old offsets remain untouched until the user arranges that element or resets it; free movement is an advanced mode.
- Supported scope remains the bundled development demo. This is not automatic React/Next/Vue component discovery, a source transform or a production runtime. Fixed internal card text, multi-selection, resize handles and drag-edge auto-scroll remain outside this change.

## Verification

- 5 model/store tests: placement validation, stable source baselines, invalid move targets, inserted subtree cleanup, and previous draft/security/storage checks.
- 16 Chromium browser tests: automatic insertion/order, real pointer drag, cross-frame placement, layout selection, constraints, reload persistence, exact Undo restoration, removal of frames containing source elements, plus all previous styling/actions/free-move tests.
- TypeScript/Vite build and desktop visual inspection.
