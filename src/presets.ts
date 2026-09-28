import { presets } from "./shared/catalog.ts";
export function createPreset(id: string): HTMLElement {
  const preset = presets.find((p) => p.id === id);
  if (!preset) throw new Error("Unknown component");
  const el = document.createElement(preset.tag);
  el.dataset.tweakloomPreset = id;
  el.style.cssText =
    "box-sizing:border-box;margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#34333f;flex-shrink:0;";
  if (id === "button") {
    el.textContent = "Button";
    (el as HTMLButtonElement).type = "button";
    Object.assign(el.style, {
      padding: "12px 24px",
      border: "0px solid #7956ce",
      borderRadius: "8px",
      backgroundColor: "#7956ce",
      color: "#ffffff",
      width: "fit-content",
    });
  }
  if (id === "dropdown") {
    el.setAttribute("aria-label", "Dropdown");
    el.append(
      ...["Option one", "Option two", "Option three"].map(
        (text) => new Option(text, text),
      ),
    );
    Object.assign(el.style, {
      padding: "10px 14px",
      border: "1px solid #d8d2e4",
      borderRadius: "8px",
      backgroundColor: "#ffffff",
      minWidth: "160px",
    });
  }
  if (id === "input") {
    (el as HTMLInputElement).placeholder = "Enter text…";
    el.setAttribute("aria-label", "Text input");
    Object.assign(el.style, {
      padding: "10px 14px",
      border: "1px solid #d8d2e4",
      borderRadius: "8px",
      backgroundColor: "#ffffff",
      width: "200px",
    });
  }
  if (id === "heading") {
    el.textContent = "Your next big idea";
    Object.assign(el.style, { fontSize: "28px", fontWeight: "600" });
  }
  if (id === "paragraph") {
    el.textContent = "A little space for your story.";
    el.style.maxWidth = "320px";
  }
  if (id === "divider")
    Object.assign(el.style, {
      height: "1px",
      width: "240px",
      border: "0px solid #d8d2e4",
      backgroundColor: "#d8d2e4",
    });
  if (id === "card") {
    el.dataset.tweakloomContainer = "";
    Object.assign(el.style, {
      padding: "24px",
      width: "250px",
      minHeight: "120px",
      border: "1px solid #e3dced",
      borderRadius: "12px",
      backgroundColor: "#faf8ff",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    });
    const title = document.createElement("strong");
    title.textContent = "A fresh start";
    const text = document.createElement("p");
    text.textContent = "Add something worth sharing.";
    text.style.margin = "0";
    el.append(title, text);
  }
  if (["frame", "row", "grid"].includes(id)) {
    el.dataset.tweakloomContainer = "";
    el.setAttribute("aria-label", preset.label);
    Object.assign(el.style, {
      width: "300px",
      minHeight: "140px",
      padding: "20px",
      border: "1px dashed #b7a5d4",
      borderRadius: "8px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      backgroundColor: "#faf8ff",
    });
    if (id === "row")
      Object.assign(el.style, {
        width: "100%",
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
      });
    if (id === "grid")
      Object.assign(el.style, {
        width: "100%",
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        alignItems: "start",
      });
  }
  return el;
}
