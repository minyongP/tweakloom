import { useEffect, useRef, useState } from "react";
import {
  freeGridStyles,
  fonts,
  styleFields,
  optionLabels,
  elementLabels,
} from "./shared/catalog.ts";
import { parseInteraction } from "./shared/draft.ts";
import type {
  ElementInfo,
  Operation,
  StyleProperty,
  Interaction,
} from "./shared/draft.ts";

export function Inspector({
  element,
  disabled,
  apply,
  applyMany,
  freeMove,
  nudge,
  selectParent,
}: {
  element: ElementInfo;
  disabled: boolean;
  apply: (op: Operation) => void;
  applyMany: (ops: Operation[]) => void;
  freeMove: boolean;
  nudge: (direction: "earlier" | "later") => void;
  selectParent: () => void;
}) {
  const editing = useRef(new Set<string>());
  const isGrid = element.styles.display.includes("grid");
  const distributionProperty = isGrid ? "justifyItems" : "justifyContent";
  const [text, setText] = useState(element.text);
  const [optionText, setOptionText] = useState(
    (element.options ?? []).join("\n"),
  );
  const convert = (key: StyleProperty, value: string) => {
    if (key === "fontFamily")
      return fonts.find((font) => font === value.replaceAll('"', "")) ?? value;
    const field = styleFields[key];
    if (field.type === "color") {
      const parts = value.match(/[\d.]+/g);
      return parts && parts.length >= 3
        ? "#" +
            parts
              .slice(0, 3)
              .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
              .join("")
        : "#000000";
    }
    if (field.type === "px" || field.type === "signed-px")
      return ["auto", "100%", "fit-content"].includes(value) ||
        (key === "lineHeight" && value === "normal")
        ? value
        : String(Math.round((parseFloat(value) || 0) * 100) / 100);
    return value;
  };
  const initial = () =>
    Object.fromEntries(
      Object.entries(element.styles).map(([key, value]) => [
        key,
        convert(key as StyleProperty, value),
      ]),
    ) as Record<StyleProperty, string>;
  const [values, setValues] = useState(initial);
  const coordinates = (value: string) =>
    value.split(" ").map((v) => parseFloat(v) || 0);
  const [x, setX] = useState(
    String(coordinates(element.styles.translate)[0] || 0),
  );
  const [y, setY] = useState(
    String(coordinates(element.styles.translate)[1] || 0),
  );
  useEffect(() => {
    if (!editing.current.has("text")) setText(element.text);
    if (!editing.current.has("options"))
      setOptionText((element.options ?? []).join("\n"));
    setValues(
      (current) =>
        Object.fromEntries(
          Object.entries(element.styles).map(([key, value]) => [
            key,
            editing.current.has(key)
              ? current[key as StyleProperty]
              : convert(key as StyleProperty, value),
          ]),
        ) as Record<StyleProperty, string>,
    );
    if (!editing.current.has("translate")) {
      const p = coordinates(element.styles.translate);
      setX(String(p[0] || 0));
      setY(String(p[1] || 0));
    }
  }, [element]);
  const style = (property: StyleProperty, after: string) => {
    editing.current.delete(property);
    if (property === "gridColumnStart" && after !== "auto")
      after = String(
        Math.min(
          Number(after),
          Math.max(
            1,
            (element.parentGridColumns ?? 12) -
              (Number(values.gridColumnEnd.replace("span ", "")) || 1) +
              1,
          ),
        ),
      );
    if (property === "gridColumnEnd" && after !== "auto")
      after = `span ${Math.min(Number(after.replace("span ", "")), Math.max(1, (element.parentGridColumns ?? 12) - (Number(values.gridColumnStart) || 1) + 1))}`;
    if (property === "gridRowStart" && after !== "auto")
      after = String(
        Math.min(
          Number(after),
          40 - (Number(values.gridRowEnd.replace("span ", "")) || 1) + 1,
        ),
      );
    if (property === "gridRowEnd" && after !== "auto")
      after = `span ${Math.min(Number(after.replace("span ", "")), 40 - (Number(values.gridRowStart) || 1) + 1)}`;
    apply({
      targetId: element.id,
      tag: element.tag,
      kind: "style",
      property,
      before: element.baseline?.styles[property] ?? element.styles[property],
      after,
    });
  };
  return (
    <fieldset disabled={disabled} className="properties detailed-properties">
      <div className="selected-element">
        <span className="selected-tag">{element.tag}</span>
        <div>
          <h2>
            {elementLabels[element.id] ?? element.id.replaceAll("-", " ")}
          </h2>
          <span>{element.container ? "프레임 / 컨테이너" : "선택한 요소"}</span>
        </div>
      </div>
      {!freeMove && (
        <section className="property-section">
          <h3>배치 순서</h3>
          <p className="field-hint">
            {element.parentId
              ? `${element.parentId} 안에 있습니다. 컴포넌트 사이로 드래그해 순서를 바꾸세요.`
              : "프레임 안의 컴포넌트를 선택해 순서를 바꾸세요."}
          </p>
          <div className="layout-buttons">
            <button
              disabled={!element.parentId}
              onClick={() => nudge("earlier")}
            >
              앞으로 이동
            </button>
            <button disabled={!element.parentId} onClick={() => nudge("later")}>
              뒤로 이동
            </button>
          </div>
          {element.parentId && (
            <button className="small-apply" onClick={selectParent}>
              상위 프레임 배치 수정
            </button>
          )}
          {element.styles.translate !== "none" && (
            <button
              className="small-apply"
              onClick={() => style("translate", "none")}
            >
              자동 배치로 복귀
            </button>
          )}
        </section>
      )}
      {freeMove && (
        <section className="property-section">
          <h3>위치</h3>
          <div className="position-row">
            <label>
              X
              <input
                aria-label="X 위치"
                type="number"
                min="-9999"
                max="9999"
                value={x}
                onChange={(e) => {
                  editing.current.add("translate");
                  setX(e.target.value);
                }}
              />
            </label>
            <label>
              Y
              <input
                aria-label="Y 위치"
                type="number"
                min="-9999"
                max="9999"
                value={y}
                onChange={(e) => {
                  editing.current.add("translate");
                  setY(e.target.value);
                }}
              />
            </label>
            <button
              aria-label="위치 적용"
              onClick={() => style("translate", `${x}px ${y}px`)}
            >
              ↵
            </button>
            <button
              aria-label="위치 초기화"
              onClick={() => style("translate", "none")}
            >
              ↺
            </button>
          </div>
          <p className="field-hint">
            격자 없이 드래그하세요. 미리보기에서 방향키는 1px, Shift+방향키는
            10px 이동합니다. X·Y는 원래 위치 기준 이동 거리입니다.
          </p>
        </section>
      )}
      {element.container && !freeMove && (
        <section className="property-section">
          <h3>내부 요소 배치</h3>
          <button
            className="small-apply"
            onClick={() =>
              applyMany(
                Object.entries(freeGridStyles).map(([property, after]) => ({
                  targetId: element.id,
                  tag: element.tag,
                  kind: "style",
                  property: property as StyleProperty,
                  before:
                    element.baseline?.styles[property as StyleProperty] ??
                    element.styles[property as StyleProperty],
                  after,
                })),
              )
            }
          >
            자유 그리드로 전환
          </button>
          <p className="field-hint">
            자유 그리드는 빈 칸에 놓을 수 있습니다. 요소의 시작 행·열과 차지할
            칸 수를 조절하세요. 같은 칸에 놓으면 겹칠 수 있습니다.
          </p>
          <div className="layout-buttons">
            {(["가로", "세로", "그리드"] as const).map((layout) => (
              <button
                key={layout}
                aria-label={`${layout} 배치`}
                onClick={() => {
                  const styles: Partial<Record<StyleProperty, string>> =
                    layout === "그리드"
                      ? {
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gridTemplateRows: "none",
                          gridAutoRows: "auto",
                          gap: "16px",
                        }
                      : {
                          display: "flex",
                          flexDirection: layout === "가로" ? "row" : "column",
                          flexWrap: layout === "가로" ? "wrap" : "nowrap",
                          alignItems: "flex-start",
                        };
                  applyMany(
                    Object.entries(styles).map(([property, after]) => ({
                      targetId: element.id,
                      tag: element.tag,
                      kind: "style",
                      property: property as StyleProperty,
                      before:
                        element.baseline?.styles[property as StyleProperty] ??
                        element.styles[property as StyleProperty],
                      after,
                    })),
                  );
                }}
              >
                {layout === "가로"
                  ? "↔ 가로"
                  : layout === "세로"
                    ? "↕ 세로"
                    : "▦ 그리드"}
              </button>
            ))}
          </div>
          <div className="frame-controls">
            {element.styles.display.includes("grid") && (
              <label>
                열 수
                <select
                  aria-label="그리드 열 수"
                  value={Math.min(
                    12,
                    element.styles.gridTemplateColumns.split(" ").length,
                  )}
                  onChange={(e) =>
                    style(
                      "gridTemplateColumns",
                      `repeat(${e.target.value}, minmax(0, 1fr))`,
                    )
                  }
                >
                  {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}열
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              간격 (px)
              <div className="gap-control">
                <input
                  aria-label="프레임 간격"
                  type="number"
                  min="0"
                  max="9999"
                  value={values.gap}
                  onChange={(e) => {
                    editing.current.add("gap");
                    setValues({ ...values, gap: e.target.value });
                  }}
                />
                <button
                  aria-label="프레임 간격 적용"
                  onClick={() => style("gap", `${values.gap}px`)}
                >
                  ↵
                </button>
              </div>
            </label>
            <label>
              {isGrid || element.styles.flexDirection.startsWith("row")
                ? "세로 정렬"
                : "가로 정렬"}
              <select
                aria-label="프레임 정렬"
                value={element.styles.alignItems}
                onChange={(e) => style("alignItems", e.target.value)}
              >
                {!["flex-start", "center", "flex-end", "stretch"].includes(
                  element.styles.alignItems,
                ) && <option value={element.styles.alignItems}>현재 값</option>}
                <option value="flex-start">시작</option>
                <option value="center">가운데</option>
                <option value="flex-end">끝</option>
                <option value="stretch">늘리기</option>
              </select>
            </label>
            <label>
              {isGrid ? "가로 정렬" : "공간 배분"}
              <select
                aria-label="프레임 공간 배분"
                value={element.styles[distributionProperty]}
                onChange={(e) => style(distributionProperty, e.target.value)}
              >
                {![
                  "flex-start",
                  "center",
                  "flex-end",
                  "space-between",
                  "space-around",
                  "space-evenly",
                  ...(isGrid ? ["stretch"] : []),
                ].includes(element.styles[distributionProperty]) && (
                  <option value={element.styles[distributionProperty]}>
                    현재 값
                  </option>
                )}
                <option value="flex-start">시작</option>
                <option value="center">가운데</option>
                <option value="flex-end">끝</option>
                {isGrid ? (
                  <option value="stretch">늘리기</option>
                ) : (
                  <>
                    <option value="space-between">요소 사이 균등</option>
                    <option value="space-evenly">모든 간격 균등</option>
                    <option value="space-around">요소 주변 균등</option>
                  </>
                )}
              </select>
            </label>
          </div>
          <p className="field-hint">
            간격과 정렬은 이 프레임을 따릅니다. 가장자리에 놓으면 옆에, 중앙에
            놓으면 안에 배치됩니다.
            {element.accepts
              ? ` 허용 태그: ${element.accepts.join(", ")}.`
              : ""}
          </p>
        </section>
      )}
      <section className="property-section">
        <h3>컴포넌트 너비</h3>
        <div className="layout-buttons">
          <button onClick={() => style("width", "fit-content")}>
            내용에 맞춤
          </button>
          <button onClick={() => style("width", "100%")}>너비 채우기</button>
          <button onClick={() => style("width", "auto")}>자동</button>
        </div>
      </section>
      {element.leaf && (
        <section className="property-section">
          <h3>콘텐츠</h3>
          <label htmlFor="text-content">텍스트 내용</label>
          <textarea
            id="text-content"
            value={text}
            maxLength={2000}
            rows={3}
            onChange={(e) => {
              editing.current.add("text");
              setText(e.target.value);
            }}
          />
          <button
            className="small-apply"
            onClick={() => {
              editing.current.delete("text");
              apply({
                targetId: element.id,
                tag: element.tag,
                kind: "text",
                before: element.baseline?.text ?? element.text,
                after: text,
              });
            }}
          >
            텍스트 적용
          </button>
        </section>
      )}
      {element.tag === "select" && (
        <section className="property-section">
          <h3>선택 항목</h3>
          <label htmlFor="dropdown-options">드롭다운 항목</label>
          <textarea
            id="dropdown-options"
            rows={4}
            value={optionText}
            onChange={(e) => {
              editing.current.add("options");
              setOptionText(e.target.value);
            }}
          />
          <p className="field-hint">
            한 줄에 한 항목씩, 중복 없이 최대 20개까지 입력하세요.
          </p>
          <button
            onClick={() => {
              editing.current.delete("options");
              apply({
                targetId: element.id,
                tag: element.tag,
                kind: "options",
                before: JSON.stringify(
                  element.baseline?.options ?? element.options,
                ),
                after: JSON.stringify(optionText.split("\n")),
              });
            }}
          >
            항목 적용
          </button>
        </section>
      )}
      {[
        ...(!freeMove && element.parentGrid ? ["그리드 위치"] : []),
        "글꼴",
        "모양",
        "크기와 여백",
        ...(!freeMove && element.container ? ["자동 배치"] : []),
      ].map((group) => (
        <section className="property-section" key={group}>
          <h3>{group}</h3>
          {Object.entries(styleFields)
            .filter(
              ([key, field]) =>
                field.group === group &&
                ![
                  "gridTemplateColumns",
                  "justifyItems",
                  "gap",
                  "alignItems",
                  "justifyContent",
                ].includes(key),
            )
            .map(([key, field]) => {
              const property = key as StyleProperty;
              const select = field.type === "select",
                color = field.type === "color",
                number = field.type === "number";
              return (
                <div
                  className={`property ${select ? "wide-property" : ""}`}
                  key={key}
                >
                  <label htmlFor={key}>
                    {field.label}
                    {!select && !color && !number ? " (px)" : ""}
                  </label>
                  <div className="property-control">
                    {select ? (
                      <select
                        id={key}
                        value={values[property]}
                        onChange={(e) => {
                          editing.current.add(key);
                          setValues({ ...values, [key]: e.target.value });
                        }}
                      >
                        {!(field.options as readonly string[]).includes(
                          values[property],
                        ) && (
                          <option value={values[property]}>
                            {values[property] || "상속된 값"}
                          </option>
                        )}
                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option.startsWith("span ")
                              ? `${option.slice(5)}칸`
                              : option === "auto"
                                ? "자동"
                                : option === "64px"
                                  ? "사용 (64px 행)"
                                  : option.startsWith("repeat(")
                                    ? `${option.match(/\d+/)?.[0]}행`
                                    : (optionLabels[option] ?? option)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={key}
                        type={color ? "color" : number ? "number" : "text"}
                        min={field.type === "signed-px" ? -9999 : 0}
                        max={number ? 1 : 9999}
                        step={number ? 0.05 : 0.1}
                        value={values[property]}
                        onChange={(e) => {
                          editing.current.add(key);
                          setValues({ ...values, [key]: e.target.value });
                        }}
                      />
                    )}
                    {color && (
                      <span className="hex-value">
                        {element.styles[property] === "rgba(0, 0, 0, 0)" &&
                        !editing.current.has(key)
                          ? "none"
                          : values[property]}
                      </span>
                    )}
                    <button
                      aria-label={`${field.label} 적용`}
                      onClick={() =>
                        style(
                          property,
                          select ||
                            color ||
                            number ||
                            ["auto", "normal", "100%", "fit-content"].includes(
                              values[property],
                            )
                            ? values[property]
                            : `${values[property]}px`,
                        )
                      }
                    >
                      ↵
                    </button>
                  </div>
                </div>
              );
            })}
          {group === "자동 배치" && (
            <p className="field-hint">
              자동 배치 (Flex)를 선택하면 내부 요소를 가로나 세로로 배치할 수
              있습니다. 공간 배분과 정렬은 컨테이너에 적용됩니다.
            </p>
          )}
        </section>
      ))}
    </fieldset>
  );
}

const defaultApi = {
  method: "GET",
  url: "/api/items",
  headers: "{}",
  body: "",
  credentialRef: "",
  responseStatus: 200,
  response: '{"ok":true}',
};
export function Actions({
  element,
  operation,
  disabled,
  apply,
  test,
  remove,
}: {
  element: ElementInfo;
  operation?: Operation;
  disabled: boolean;
  apply: (op: Operation) => void;
  test: () => void;
  remove: () => void;
}) {
  const saved = operation ? parseInteraction(operation.after) : null;
  const [type, setType] = useState<"none" | "navigate" | "api">(
    saved?.type ?? "none",
  );
  const [destination, setDestination] = useState(
    saved?.type === "navigate" ? saved.destination : "/",
  );
  const [newTab, setNewTab] = useState(
    saved?.type === "navigate" ? saved.newTab : false,
  );
  const [api, setApi] = useState(saved?.type === "api" ? saved : defaultApi);
  const [error, setError] = useState("");
  function save() {
    if (type === "none") {
      if (operation) remove();
      setError("");
      return;
    }
    try {
      const action: Interaction =
        type === "navigate"
          ? { type: "navigate", destination, newTab }
          : { ...api, type: "api" };
      const after = JSON.stringify(action);
      parseInteraction(after);
      apply({
        targetId: element.id,
        tag: element.tag,
        kind: "interaction",
        before: "",
        after,
      });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <fieldset className="action-form" disabled={disabled}>
      <div className="selected-element">
        <span className="selected-tag">↗</span>
        <div>
          <h2>클릭했을 때</h2>
          <span>{element.id}</span>
        </div>
      </div>
      <div className="action-fields">
        <label>
          동작 종류
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as "none" | "navigate" | "api");
              setError("");
            }}
          >
            <option value="none">없음</option>
            <option value="navigate">페이지 이동</option>
            <option value="api">API 요청</option>
          </select>
        </label>
        {type === "none" ? (
          <p className="field-hint">
            클릭 동작 없이 글이나 이미지로 표시합니다.
          </p>
        ) : type === "navigate" ? (
          <>
            <label>
              이동 경로
              <input
                value={destination}
                placeholder="/checkout 또는 https://…"
                onChange={(e) => setDestination(e.target.value)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={newTab}
                onChange={(e) => setNewTab(e.target.checked)}
              />
              새 탭에서 열기
            </label>
          </>
        ) : (
          <>
            <label>
              HTTP 메서드
              <select
                value={api.method}
                onChange={(e) => setApi({ ...api, method: e.target.value })}
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              API URL
              <input
                value={api.url}
                onChange={(e) => setApi({ ...api, url: e.target.value })}
              />
            </label>
            <label>
              헤더 (JSON)
              <textarea
                rows={3}
                value={api.headers}
                onChange={(e) => setApi({ ...api, headers: e.target.value })}
              />
            </label>
            <label>
              요청 본문 (JSON)
              <textarea
                rows={4}
                value={api.body}
                onChange={(e) => setApi({ ...api, body: e.target.value })}
              />
            </label>
            <label>
              인증 정보 참조
              <input
                placeholder="API_TOKEN"
                value={api.credentialRef}
                onChange={(e) =>
                  setApi({ ...api, credentialRef: e.target.value })
                }
              />
            </label>
            <p className="field-hint">
              환경 변수 이름을 입력하세요. 토큰이나 비밀번호를 직접 붙여 넣지
              마세요.
            </p>
            <label>
              모의 응답 상태
              <input
                type="number"
                min="100"
                max="599"
                value={api.responseStatus}
                onChange={(e) =>
                  setApi({ ...api, responseStatus: Number(e.target.value) })
                }
              />
            </label>
            <label>
              모의 응답 (JSON)
              <textarea
                rows={4}
                value={api.response}
                onChange={(e) => setApi({ ...api, response: e.target.value })}
              />
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="action-buttons">
          <button
            className="primary"
            disabled={type === "none" && !operation}
            onClick={save}
          >
            동작 적용
          </button>
          <button disabled={!operation} onClick={test}>
            동작 테스트
          </button>
          {operation && <button onClick={remove}>동작 삭제</button>}
        </div>
        <p className="simulation-note">
          저장한 동작을 모의 실행합니다. 실제 API 요청이나 페이지 이동은
          일어나지 않습니다. 이 설정은 AI 구현을 위한 편집안에 포함됩니다.
        </p>
      </div>
    </fieldset>
  );
}
