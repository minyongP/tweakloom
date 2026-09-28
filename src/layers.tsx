import { useState } from "react";
import type { ElementInfo } from "./shared/draft.ts";
import { elementLabels } from "./shared/catalog.ts";

export function Layers({
  elements,
  selected,
  disabled,
  select,
  reparent,
}: {
  elements: ElementInfo[];
  selected: ElementInfo | null;
  disabled: boolean;
  select: (id: string) => void;
  reparent: (id: string, parentId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const name = (el: ElementInfo) =>
    elementLabels[el.id] ?? el.id.replaceAll("-", " ");
  const byId = new Map(elements.map((el) => [el.id, el]));
  function inside(id: string, ancestor: string) {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current && !seen.has(current)) {
      if (current === ancestor) return true;
      seen.add(current);
      current = byId.get(current)?.parentId;
    }
    return false;
  }
  const destinations = selected
    ? elements.filter(
        (el) =>
          el.container &&
          !inside(el.id, selected.id) &&
          (!el.accepts || el.accepts.includes(selected.tag)),
      )
    : [];
  const rows: { element: ElementInfo; depth: number; children: boolean }[] = [];
  const seen = new Set<string>();
  function walk(parentId: string, depth: number) {
    for (const el of elements.filter(
      (el) =>
        el.id !== "page-root" && (el.parentId ?? "page-root") === parentId,
    )) {
      if (seen.has(el.id)) continue;
      seen.add(el.id);
      const children = elements.some((child) => child.parentId === el.id);
      rows.push({ element: el, depth, children });
      if (!collapsed.includes(el.id)) walk(el.id, depth + 1);
    }
  }
  walk("page-root", 0);
  function drop(event: React.DragEvent, parentId: string) {
    event.preventDefault();
    if (!disabled && dragging) {
      reparent(dragging, parentId);
      setCollapsed((v) => v.filter((id) => id !== parentId));
    }
    setDragging(null);
  }
  return (
    <>
      <div
        className="page-label"
        onDragOver={(e) => {
          if (dragging) e.preventDefault();
        }}
        onDrop={(e) => drop(e, "page-root")}
      >
        ▧ <span>페이지 최상위</span>
        <small>드롭하면 분리</small>
      </div>
      <div className="element-list" role="tree" aria-label="페이지 요소 계층">
        {rows.map(({ element: el, depth, children }) => (
          <div
            key={el.id}
            role="treeitem"
            aria-level={depth + 1}
            aria-selected={selected?.id === el.id}
            aria-expanded={children ? !collapsed.includes(el.id) : undefined}
            data-layer-id={el.id}
            data-parent-id={el.parentId ?? "page-root"}
            className="layer-row"
            style={{ paddingLeft: Math.min(depth, 10) * 14 }}
            onDragOver={(e) => {
              if (dragging && el.container) e.preventDefault();
            }}
            onDrop={(e) => drop(e, el.id)}
          >
            {children ? (
              <button
                className="layer-toggle"
                aria-label={
                  collapsed.includes(el.id)
                    ? "하위 요소 펼치기"
                    : "하위 요소 접기"
                }
                onClick={() =>
                  setCollapsed((v) =>
                    v.includes(el.id)
                      ? v.filter((id) => id !== el.id)
                      : [...v, el.id],
                  )
                }
              >
                {collapsed.includes(el.id) ? "▸" : "▾"}
              </button>
            ) : (
              <span className="layer-spacer" />
            )}
            <button
              className={selected?.id === el.id ? "element active" : "element"}
              aria-pressed={selected?.id === el.id}
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(e) => {
                setDragging(el.id);
                e.dataTransfer.setData("text/plain", el.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragging(null)}
              onClick={() => select(el.id)}
              title={`${name(el)} · ${el.id}`}
            >
              <span className="tag-icon" aria-hidden="true">
                {el.container ? "▣" : el.tag.startsWith("h") ? "T" : "≡"}
              </span>
              <span>{name(el)}</span>
            </button>
          </div>
        ))}
      </div>
      {selected && selected.id !== "page-root" && (
        <fieldset className="layer-parent" disabled={disabled}>
          <label htmlFor="layer-parent">소속 영역</label>
          <select
            id="layer-parent"
            value={selected.parentId ?? "page-root"}
            onChange={(e) => reparent(selected.id, e.target.value)}
          >
            {destinations.map((el) => (
              <option key={el.id} value={el.id}>
                {name(el)}
              </option>
            ))}
          </select>
          <button
            disabled={!selected.parentId || selected.parentId === "page-root"}
            onClick={() => reparent(selected.id, "page-root")}
          >
            부모에서 분리
          </button>
          <p>
            들여쓴 요소는 부모와 함께 움직입니다. 소속을 바꿔도 화면 위치는
            유지됩니다.
          </p>
        </fieldset>
      )}
    </>
  );
}
