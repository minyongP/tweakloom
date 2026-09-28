import { useEffect, useRef, useState } from "react";
import { fonts, styleFields } from "./shared/catalog.ts";
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
          <h2>{element.id.replaceAll("-", " ")}</h2>
          <span>
            {element.container ? "Frame / container" : "Selected instance"}
          </span>
        </div>
      </div>
      {!freeMove && (
        <section className="property-section">
          <h3>Layout placement</h3>
          <p className="field-hint">
            {element.parentId
              ? `Inside ${element.parentId.replaceAll("-", " ")}. Drag between components to rearrange.`
              : "Select a component inside a frame to rearrange it."}
          </p>
          <div className="layout-buttons">
            <button
              disabled={!element.parentId}
              onClick={() => nudge("earlier")}
            >
              Move earlier
            </button>
            <button disabled={!element.parentId} onClick={() => nudge("later")}>
              Move later
            </button>
          </div>
          {element.parentId && (
            <button className="small-apply" onClick={selectParent}>
              Edit parent layout
            </button>
          )}
          {element.styles.translate !== "none" && (
            <button
              className="small-apply"
              onClick={() => style("translate", "none")}
            >
              Return to layout
            </button>
          )}
        </section>
      )}
      {freeMove && (
        <section className="property-section">
          <h3>Position</h3>
          <div className="position-row">
            <label>
              X
              <input
                aria-label="Position X"
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
                aria-label="Position Y"
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
              aria-label="Apply position"
              onClick={() => style("translate", `${x}px ${y}px`)}
            >
              ↵
            </button>
            <button
              aria-label="Reset position"
              onClick={() => style("translate", "none")}
            >
              ↺
            </button>
          </div>
          <p className="field-hint">
            Drag on the page, or set offsets from the original layout.
          </p>
        </section>
      )}
      {element.container && (
        <section className="property-section">
          <h3>Arrange children</h3>
          <div className="layout-buttons">
            {(["Row", "Column", "Grid"] as const).map((layout) => (
              <button
                key={layout}
                aria-label={`${layout} layout`}
                onClick={() => {
                  const styles: Partial<Record<StyleProperty, string>> =
                    layout === "Grid"
                      ? {
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: "16px",
                        }
                      : {
                          display: "flex",
                          flexDirection: layout === "Row" ? "row" : "column",
                          flexWrap: layout === "Row" ? "wrap" : "nowrap",
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
                {layout === "Row"
                  ? "↔ Row"
                  : layout === "Column"
                    ? "↕ Column"
                    : "▦ Grid"}
              </button>
            ))}
          </div>
          <div className="frame-controls">
            {element.styles.display.includes("grid") && (
              <label>
                Columns
                <select
                  aria-label="Grid column count"
                  value={Math.min(
                    4,
                    element.styles.gridTemplateColumns.split(" ").length,
                  )}
                  onChange={(e) =>
                    style(
                      "gridTemplateColumns",
                      `repeat(${e.target.value}, minmax(0, 1fr))`,
                    )
                  }
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "column" : "columns"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Gap (px)
              <div className="gap-control">
                <input
                  aria-label="Frame gap"
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
                  aria-label="Apply frame gap"
                  onClick={() => style("gap", `${values.gap}px`)}
                >
                  ↵
                </button>
              </div>
            </label>
            <label>
              {isGrid || element.styles.flexDirection.startsWith("row")
                ? "Vertical align"
                : "Horizontal align"}
              <select
                aria-label="Frame alignment"
                value={element.styles.alignItems}
                onChange={(e) => style("alignItems", e.target.value)}
              >
                {!["flex-start", "center", "flex-end", "stretch"].includes(
                  element.styles.alignItems,
                ) && <option value={element.styles.alignItems}>Current</option>}
                <option value="flex-start">Start</option>
                <option value="center">Center</option>
                <option value="flex-end">End</option>
                <option value="stretch">Stretch</option>
              </select>
            </label>
            <label>
              {isGrid ? "Horizontal align" : "Distribute"}
              <select
                aria-label="Frame distribution"
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
                    Current
                  </option>
                )}
                <option value="flex-start">Start</option>
                <option value="center">Center</option>
                <option value="flex-end">End</option>
                {isGrid ? (
                  <option value="stretch">Stretch</option>
                ) : (
                  <>
                    <option value="space-between">Space between</option>
                    <option value="space-evenly">Even spacing</option>
                    <option value="space-around">Space around</option>
                  </>
                )}
              </select>
            </label>
          </div>
          <p className="field-hint">
            Spacing and alignment follow this frame. Drop at an edge to place
            beside a frame, or in its center to place inside.
            {element.accepts ? ` Accepts: ${element.accepts.join(", ")}.` : ""}
          </p>
        </section>
      )}
      <section className="property-section">
        <h3>Component width</h3>
        <div className="layout-buttons">
          <button onClick={() => style("width", "fit-content")}>
            Fit content
          </button>
          <button onClick={() => style("width", "100%")}>Fill width</button>
          <button onClick={() => style("width", "auto")}>Auto</button>
        </div>
      </section>
      {element.leaf && (
        <section className="property-section">
          <h3>Content</h3>
          <label htmlFor="text-content">Text content</label>
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
            Apply text
          </button>
        </section>
      )}
      {element.tag === "select" && (
        <section className="property-section">
          <h3>Options</h3>
          <label htmlFor="dropdown-options">Dropdown options</label>
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
            One option per line. Up to 20 unique options.
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
            Apply options
          </button>
        </section>
      )}
      {[
        "Typography",
        "Appearance",
        "Size & spacing",
        ...(element.container ? ["Auto layout"] : []),
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
                            {values[property] || "Inherited"}
                          </option>
                        )}
                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
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
                      aria-label={`Apply ${key}`}
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
          {group === "Auto layout" && (
            <p className="field-hint">
              Choose Flex to arrange children in a row or column. Distribution
              and alignment apply to the container.
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
  const [type, setType] = useState(saved?.type ?? "navigate");
  const [destination, setDestination] = useState(
    saved?.type === "navigate" ? saved.destination : "/",
  );
  const [newTab, setNewTab] = useState(
    saved?.type === "navigate" ? saved.newTab : false,
  );
  const [api, setApi] = useState(saved?.type === "api" ? saved : defaultApi);
  const [error, setError] = useState("");
  function save() {
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
          <h2>On click</h2>
          <span>{element.id}</span>
        </div>
      </div>
      <div className="action-fields">
        <label>
          Action type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "navigate" | "api")}
          >
            <option value="navigate">Navigate to page</option>
            <option value="api">API request</option>
          </select>
        </label>
        {type === "navigate" ? (
          <>
            <label>
              Destination
              <input
                value={destination}
                placeholder="/checkout or https://…"
                onChange={(e) => setDestination(e.target.value)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={newTab}
                onChange={(e) => setNewTab(e.target.checked)}
              />
              Open in new tab
            </label>
          </>
        ) : (
          <>
            <label>
              HTTP method
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
              Headers (JSON)
              <textarea
                rows={3}
                value={api.headers}
                onChange={(e) => setApi({ ...api, headers: e.target.value })}
              />
            </label>
            <label>
              Request body (JSON)
              <textarea
                rows={4}
                value={api.body}
                onChange={(e) => setApi({ ...api, body: e.target.value })}
              />
            </label>
            <label>
              Credentials reference
              <input
                placeholder="API_TOKEN"
                value={api.credentialRef}
                onChange={(e) =>
                  setApi({ ...api, credentialRef: e.target.value })
                }
              />
            </label>
            <p className="field-hint">
              Reference an environment variable. Do not paste tokens or
              passwords.
            </p>
            <label>
              Mock status
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
              Mock response (JSON)
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
          <button className="primary" onClick={save}>
            Apply action
          </button>
          <button disabled={!operation} onClick={test}>
            Test action
          </button>
          {operation && <button onClick={remove}>Remove action</button>}
        </div>
        <p className="simulation-note">
          Prototype only. Tests simulate the saved action; no API request or
          page navigation occurs. These settings are included in the exported
          draft for AI implementation.
        </p>
      </div>
    </fieldset>
  );
}
