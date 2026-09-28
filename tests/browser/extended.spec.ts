import { test, expect } from "@playwright/test";
import { rm, readFile } from "node:fs/promises";
test.beforeEach(async () => {
  await rm(".tweakloom/e2e", { recursive: true, force: true });
});

test("inserts components from both libraries, edits fonts and options, and restores them", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Preview connected", { exact: true }),
  ).toBeVisible();
  const preview = page.frameLocator("iframe");
  await page
    .getByLabel("Left component library")
    .getByRole("button", { name: "Insert Heading", exact: true })
    .click();
  await expect(preview.locator('[data-tweakloom-preset="heading"]')).toHaveText(
    "Your next big idea",
  );
  await page
    .getByLabel("Font family", { exact: true })
    .selectOption("Trebuchet MS, sans-serif");
  await page
    .getByRole("button", { name: "Apply fontFamily", exact: true })
    .click();
  await expect(page.getByLabel("Font family", { exact: true })).toHaveValue(
    "Trebuchet MS, sans-serif",
  );
  await page
    .getByRole("button", { name: "Apply fontFamily", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByLabel("Font family", { exact: true })
    .selectOption("Georgia, serif");
  await page
    .getByRole("button", { name: "Apply fontFamily", exact: true })
    .click();
  await expect(preview.locator('[data-tweakloom-preset="heading"]')).toHaveCSS(
    "font-family",
    "Georgia, serif",
  );
  await page.getByRole("tab", { name: "Insert", exact: true }).click();
  await page
    .getByLabel("Right component library")
    .getByRole("button", { name: "Insert Dropdown", exact: true })
    .click();
  await expect(
    preview.locator('[data-tweakloom-preset="dropdown"]'),
  ).toBeVisible();
  await page.getByLabel("Dropdown options").fill("Small\nMedium\nLarge");
  await page
    .getByRole("button", { name: "Apply options", exact: true })
    .click();
  await expect(
    preview.locator('[data-tweakloom-preset="dropdown"] option'),
  ).toHaveText(["Small", "Medium", "Large"]);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Saved · revision 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(preview.locator('[data-tweakloom-preset="heading"]')).toHaveCSS(
    "font-family",
    "Georgia, serif",
  );
  await expect(
    preview.locator('[data-tweakloom-preset="dropdown"] option'),
  ).toHaveText(["Small", "Medium", "Large"]);
});

test("drags an existing component freely and keeps coordinates after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Drag behavior").selectOption("free");
  const title = page
    .frameLocator("iframe")
    .getByRole("heading", { name: "Make room for good work." });
  await title.scrollIntoViewIfNeeded();
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 104, box.y + 52, { steps: 8 });
  await page.mouse.up();
  await expect(title).toHaveCSS("translate", "64px 32px");
  await expect(page.getByLabel("Position X")).toHaveValue("64");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(title).toHaveCSS("translate", "none");
  await page.getByLabel("8px grid", { exact: true }).check();
  await title.scrollIntoViewIfNeeded();
  const reset = (await title.boundingBox())!;
  await page.mouse.move(reset.x + 40, reset.y + 20);
  await page.mouse.down();
  await page.mouse.move(reset.x + 107, reset.y + 55, { steps: 8 });
  await page.mouse.up();
  await expect(title).toHaveCSS("translate", "64px 32px");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Saved · revision 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(title).toHaveCSS("translate", "64px 32px");
});

test("drags a component from the right library into the preview", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Preview connected", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Insert", exact: true }).click();
  await page.getByLabel("Drag behavior").selectOption("free");
  const target = page
    .frameLocator("iframe")
    .locator('[data-tweakloom-id="draft-board"]');
  await target.scrollIntoViewIfNeeded();
  const source = await page
    .getByLabel("Right component library")
    .getByRole("button", { name: "Insert Button", exact: true })
    .boundingBox();
  const box = (await target.boundingBox())!;
  await page.mouse.move(source!.x + 30, source!.y + 25);
  await page.mouse.down();
  await page.mouse.move(source!.x - 30, source!.y + 25, { steps: 5 });
  await page.mouse.move(box.x + 70, box.y + 60, { steps: 15 });
  await page.mouse.up();
  await expect(
    target.locator('[data-tweakloom-preset="button"]'),
  ).toBeVisible();
  const placed = (await target
    .locator('[data-tweakloom-preset="button"]')
    .boundingBox())!;
  expect(Math.abs(placed.x - box.x - 70)).toBeLessThan(2);
  expect(Math.abs(placed.y - box.y - 60)).toBeLessThan(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(target.locator('[data-tweakloom-preset="button"]')).toHaveCount(
    0,
  );
});

test("configures page and API actions without navigation or outgoing requests", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .frameLocator("iframe")
    .getByRole("button", { name: /Find your essentials/ })
    .click();
  await page.getByRole("tab", { name: "Actions", exact: true }).click();
  await page.getByLabel("Action type").selectOption("navigate");
  await page.getByLabel("Destination").fill("/checkout");
  await page.getByRole("button", { name: "Apply action", exact: true }).click();
  await page.getByRole("button", { name: "Test action", exact: true }).click();
  await expect(
    page.getByLabel("Action preview", { exact: true }),
  ).toContainText("/checkout");
  await page.getByLabel("Action type").selectOption("api");
  await page.getByLabel("API URL").fill("https://example.com/orders");
  await page.getByLabel("HTTP method").selectOption("POST");
  await page.getByLabel("Request body (JSON)").fill('{"quantity":2}');
  await page.getByLabel("Mock response (JSON)").fill('{"created":true}');
  let outgoing = false;
  page.on("request", (request) => {
    if (request.url().includes("example.com/orders")) outgoing = true;
  });
  await page.getByRole("button", { name: "Apply action", exact: true }).click();
  await page.getByRole("button", { name: "Test action", exact: true }).click();
  await expect(
    page.getByLabel("Action preview", { exact: true }),
  ).toContainText("created");
  expect(outgoing).toBe(false);
  expect(page.url()).toBe("http://127.0.0.1:5174/");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Saved · revision 1", { exact: true }),
  ).toBeVisible();
  const draft = JSON.parse(await readFile(".tweakloom/e2e/draft.json", "utf8"));
  expect(
    JSON.parse(
      draft.operations.find((op: { kind: string }) => op.kind === "interaction")
        .after,
    ).method,
  ).toBe("POST");
});
