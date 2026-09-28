import { useState } from "react";
import { presets } from "./shared/catalog.ts";
import type { PresetId } from "./shared/catalog.ts";

export function Library({
  side,
  channel,
  disabled,
  insert,
}: {
  side: "Left" | "Right";
  channel: string;
  disabled: boolean;
  insert: (preset: PresetId) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = presets.filter((p) =>
    `${p.label} ${p.group}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section
      className="component-library"
      aria-label={`${side} component library`}
    >
      <label className="library-search">
        <span>⌕</span>
        <input
          aria-label={`${side} component search`}
          placeholder="Find a component…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="library-hint">Drag into a frame, or click to insert.</p>
      {["Controls", "Content", "Layout"].map((group) => (
        <div className="library-group" key={group}>
          {visible.some((p) => p.group === group) && (
            <>
              <h3>{group}</h3>
              <div className="preset-grid">
                {visible
                  .filter((p) => p.group === group)
                  .map((preset) => (
                    <button
                      key={preset.id}
                      className="preset-card"
                      disabled={disabled}
                      draggable={!disabled}
                      aria-label={`Insert ${preset.label}`}
                      onClick={() => insert(preset.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          "application/x-tweakloom",
                          JSON.stringify({ channel, preset: preset.id }),
                        );
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                    >
                      <span
                        className={`preset-thumbnail thumb-${preset.id}`}
                        aria-hidden="true"
                      >
                        {preset.id === "button" && (
                          <span className="mini-button">Button ↗</span>
                        )}
                        {preset.id === "dropdown" && (
                          <span className="mini-input">
                            Select <b>⌄</b>
                          </span>
                        )}
                        {preset.id === "input" && (
                          <span className="mini-input">Your text…</span>
                        )}
                        {preset.id === "heading" && (
                          <strong className="mini-heading">Aa</strong>
                        )}
                        {preset.id === "paragraph" && (
                          <span className="mini-lines">
                            ━━━━━━
                            <br />
                            ━━━━━
                            <br />
                            ━━━━
                          </span>
                        )}
                        {preset.id === "divider" && (
                          <span className="mini-divider" />
                        )}
                        {preset.id === "card" && (
                          <span className="mini-card">
                            <i />
                            <b>Title</b>
                            <em>Something good.</em>
                          </span>
                        )}
                        {preset.id === "frame" && (
                          <span className="mini-frame">＋</span>
                        )}
                      </span>
                      <span className="preset-name">
                        {preset.label}
                        <b>＋</b>
                      </span>
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      ))}
      {!visible.length && (
        <p className="library-hint">No matching components.</p>
      )}
    </section>
  );
}
