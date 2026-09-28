import { test, expect } from "@playwright/test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";

test.beforeEach(async () => {
  await rm(".tweakloom/e2e", { recursive: true, force: true });
});

test("edits a draft, restores it after reload and never changes source", async ({
  page,
}) => {
  const source = await readFile("src/demo.tsx", "utf8");
  await page.goto("/");
  await expect(
    page.getByText("Preview connected", { exact: true }),
  ).toBeVisible();
  const preview = page.frameLocator("iframe");
  await preview
    .getByRole("heading", { name: "Make room for good work." })
    .click();
  await page.getByLabel("Text content").fill("A little more room.");
  await page.getByRole("button", { name: "Apply text", exact: true }).click();
  await page.getByLabel("Padding (px)").fill("32");
  await page.getByRole("button", { name: "Apply padding" }).click();
  await expect(preview.locator('[data-tweakloom-id="hero-title"]')).toHaveCSS(
    "padding",
    "32px",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Saved · revision 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    preview.getByRole("heading", { name: "A little more room." }),
  ).toBeVisible();
  await expect(preview.locator('[data-tweakloom-id="hero-title"]')).toHaveCSS(
    "padding",
    "32px",
  );
  expect(await readFile("src/demo.tsx", "utf8")).toBe(source);
  const saved = JSON.parse(await readFile(".tweakloom/e2e/draft.json", "utf8"));
  expect(saved.operations).toHaveLength(2);
});

test("flags missing or ambiguous targets and changed baselines without overwriting them", async ({
  page,
}) => {
  await page.goto("/");
  const preview = page.frameLocator("iframe");
  await preview
    .getByRole("heading", { name: "Make room for good work." })
    .click();
  await page.getByLabel("Text content").fill("Draft title");
  await page.getByRole("button", { name: "Apply text", exact: true }).click();
  const frame = page.frames().find((f) => f.url().includes("/demo.html"))!;
  await frame.evaluate(() => {
    document.querySelector('[data-tweakloom-id="hero-title"]')!.textContent =
      "Changed by app";
  });
  await expect(page.getByRole("alert")).toContainText("changed in the app");
  await expect(
    preview.getByRole("heading", { name: "Changed by app" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reload preview" }).click();
  await expect(
    preview.getByRole("heading", { name: "Draft title" }),
  ).toBeVisible();
  const reloaded = page.frames().find((f) => f.url().includes("/demo.html"))!;
  await reloaded.evaluate(() => {
    const el = document.querySelector('[data-tweakloom-id="hero-title"]')!;
    el.parentElement!.append(el.cloneNode(true));
  });
  await expect(page.getByRole("alert")).toContainText("ambiguous");
  await page.getByRole("button", { name: "Reload preview" }).click();
  await expect(
    preview.getByRole("heading", { name: "Draft title" }),
  ).toBeVisible();
  await page
    .frames()
    .find((f) => f.url().includes("/demo.html"))!
    .evaluate(() =>
      document.querySelector('[data-tweakloom-id="hero-title"]')!.remove(),
    );
  await expect(page.getByRole("alert")).toContainText("missing");
});

test("rejects unauthenticated writes and ignores messages from the wrong window", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.put("/api/draft", {
        data: { expectedRevision: 0, draft: {} },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/");
  await expect(
    page.getByText("Preview connected", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.postMessage(
      { type: "selected", element: { id: "forged" } },
      location.origin,
    ),
  );
  await expect(
    page.getByText("Select something to start", { exact: true }),
  ).toBeVisible();
});

test("keeps an unsaved draft through reload and actual Vite source updates", async ({
  page,
}) => {
  await page.goto("/");
  const preview = page.frameLocator("iframe");
  await preview
    .getByRole("heading", { name: "Make room for good work." })
    .click();
  await page.getByLabel("Text content").fill("Keep my unsaved draft");
  await page.getByRole("button", { name: "Apply text", exact: true }).click();
  await expect(
    preview.getByRole("heading", { name: "Keep my unsaved draft" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    preview.getByRole("heading", { name: "Keep my unsaved draft" }),
  ).toBeVisible();
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  const original = await readFile("src/demo.tsx", "utf8");
  try {
    await writeFile(
      "src/demo.tsx",
      original.replace(
        "Make room for good work.",
        "New title from React source",
      ),
    );
    await expect(
      preview.getByRole("heading", { name: "New title from React source" }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("changed in the app");
    await expect(
      page.getByText("Unsaved changes", { exact: true }),
    ).toBeVisible();
  } finally {
    await writeFile("src/demo.tsx", original);
  }
});

test("undo refreshes inspector values, and child styles survive removing a parent draft", async ({
  page,
}) => {
  await page.goto("/");
  const preview = page.frameLocator("iframe");
  await preview
    .getByRole("heading", { name: "Make room for good work." })
    .click();
  await page.getByLabel("Text color", { exact: true }).fill("#112233");
  await page.getByRole("button", { name: "Apply color", exact: true }).click();
  await expect(preview.locator('[data-tweakloom-id="hero-title"]')).toHaveCSS(
    "color",
    "rgb(17, 34, 51)",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Text color", { exact: true })).toHaveValue(
    "#292a26",
  );
  await page.getByRole("button", { name: /card notes/i }).click();
  await page.getByLabel("Text color", { exact: true }).fill("#112233");
  await page.getByRole("button", { name: "Apply color", exact: true }).click();
  await expect(preview.locator('[data-tweakloom-id="notes-title"]')).toHaveCSS(
    "color",
    "rgb(17, 34, 51)",
  );
  await preview.getByRole("heading", { name: "A place for ideas" }).click();
  await expect(
    page.getByRole("heading", { name: "notes title", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Text color", { exact: true }).fill("#554433");
  await page.getByRole("button", { name: "Apply color", exact: true }).click();
  await expect(preview.locator('[data-tweakloom-id="notes-title"]')).toHaveCSS(
    "color",
    "rgb(85, 68, 51)",
  );
  await page
    .getByRole("button", { name: "Remove card-notes:color", exact: true })
    .click();
  await page.getByRole("button", { name: "Reload preview" }).click();
  await expect(preview.locator('[data-tweakloom-id="notes-title"]')).toHaveCSS(
    "color",
    "rgb(85, 68, 51)",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("preserves Korean characters split across HTTP chunks", async ({
  page,
}) => {
  let token = "";
  page.on("request", (req) => {
    if (req.url().endsWith("/api/draft"))
      token = req.headers()["x-tweakloom-token"];
  });
  await page.goto("/");
  await expect(
    page.getByText("Preview connected", { exact: true }),
  ).toBeVisible();
  const body = Buffer.from(
    JSON.stringify({
      expectedRevision: 0,
      draft: {
        schemaVersion: 1,
        revision: 0,
        route: "/demo.html",
        operations: [
          {
            targetId: "hero-title",
            tag: "h1",
            kind: "text",
            before: "Make room for good work.",
            after: "가나다 🌿",
          },
        ],
      },
    }),
  );
  const split = body.indexOf(Buffer.from("가")) + 1;
  const result = await new Promise<string>((resolve, reject) => {
    const request = httpRequest(
      "http://127.0.0.1:5174/api/draft",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:5174",
          "X-Tweakloom-Token": token,
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => resolve(text));
      },
    );
    request.on("error", reject);
    request.write(body.subarray(0, split));
    setTimeout(() => request.end(body.subarray(split)), 30);
  });
  expect(JSON.parse(result).operations[0].after).toBe("가나다 🌿");
});

test("locks editing while a saved draft reload is in flight", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .frameLocator("iframe")
    .getByRole("heading", { name: "Make room for good work." })
    .click();
  await expect(page.getByLabel("Text content")).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/draft", async (route) => {
    await gate;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Reload saved draft", exact: true })
    .click();
  try {
    await expect(page.getByLabel("Text content")).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByLabel("Text content")).toBeEnabled();
});
