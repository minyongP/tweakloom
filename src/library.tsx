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
    `${p.label} ${p.group} ${p.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section
      className="component-library"
      aria-label={`${side === "Left" ? "왼쪽" : "오른쪽"} 컴포넌트 목록`}
    >
      <label className="library-search">
        <span>⌕</span>
        <input
          aria-label={`${side === "Left" ? "왼쪽" : "오른쪽"} 컴포넌트 검색`}
          placeholder="컴포넌트 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="library-hint">
        컴포넌트 사이에 놓으면 간격에 맞춰 배치됩니다.
      </p>
      {["입력 요소", "콘텐츠", "레이아웃"].map((group) => (
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
                      aria-label={`${preset.label} 추가`}
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
                          <span className="mini-button">버튼 ↗</span>
                        )}
                        {preset.id === "dropdown" && (
                          <span className="mini-input">
                            선택 <b>⌄</b>
                          </span>
                        )}
                        {preset.id === "input" && (
                          <span className="mini-input">텍스트…</span>
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
                            <b>제목</b>
                            <em>설명을 입력하세요.</em>
                          </span>
                        )}
                        {preset.id === "frame" && (
                          <span className="mini-frame">＋</span>
                        )}
                        {preset.id === "row" && (
                          <span className="mini-frame">▯ ▯ ▯</span>
                        )}
                        {(preset.id === "grid" ||
                          preset.id === "free-grid") && (
                          <span className="mini-frame">▦</span>
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
      {!visible.length && <p className="library-hint">검색 결과가 없습니다.</p>}
    </section>
  );
}
