import { test, expect } from "@playwright/test";
import { rm } from "node:fs/promises";
test.beforeEach(async () => {
  await rm(".tweakloom/e2e", { recursive: true, force: true });
});

test("undo works from preview keyboard focus, redo works, and history survives save and reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Preview connected", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Left component library")
    .getByRole("button", { name: "Insert Button", exact: true })
    .click();
  const button = page
    .frameLocator("iframe")
    .locator('[data-tweakloom-preset="button"]');
  await button.click();
  await page.keyboard.press("Control+z");
  await expect(button).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(button).toHaveCount(1);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Saved · revision 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(button).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(button).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("duplicate Apply does not consume an undo step", async ({ page }) => {
  await page.goto("/");
  const title = page
    .frameLocator("iframe")
    .locator('[data-tweakloom-id="hero-title"]');
  await title.click();
  await page.getByLabel("Text color", { exact: true }).fill("#123456");
  await page.getByRole("button", { name: "Apply color", exact: true }).click();
  await page.getByRole("button", { name: "Apply color", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(title).toHaveCSS("color", "rgb(41, 42, 38)");
});

test("grid columns have visible guides, parent controls and undoable fill sizing", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Preview connected", { exact: true }),
  ).toBeVisible();
  const library = page.getByLabel("Left component library");
  await library
    .getByRole("button", { name: "Insert Grid", exact: true })
    .click();
  const preview = page.frameLocator("iframe"),
    grid = preview.locator('[data-tweakloom-preset="grid"]');
  await expect(preview.getByLabel("Grid guides")).toBeVisible();
  await page.getByLabel("Grid column count").selectOption("3");
  await expect(
    preview.getByLabel("Grid guides").locator(":scope > div"),
  ).toHaveCount(3);
  await page.getByLabel("Frame gap", { exact: true }).fill("24");
  await page
    .getByRole("button", { name: "Apply frame gap", exact: true })
    .click();
  await expect(grid).toHaveCSS("gap", "24px");
  await library
    .getByRole("button", { name: "Insert Button", exact: true })
    .click();
  const button = grid.locator('[data-tweakloom-preset="button"]');
  await page.getByRole("button", { name: "Fill width", exact: true }).click();
  await expect(button).toHaveAttribute("style", /width: 100%/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(button).toHaveAttribute("style", /width: fit-content/);
  await page
    .getByRole("button", { name: "Edit parent layout", exact: true })
    .click();
  await expect(page.getByLabel("Grid column count")).toHaveValue("3");
  await page
    .getByLabel("Frame distribution", { exact: true })
    .selectOption("center");
  await expect(grid).toHaveCSS("justify-items", "center");
  const cell = (await preview
    .getByLabel("Grid guides")
    .locator(":scope > div")
    .first()
    .boundingBox())!;
  const centered = (await button.boundingBox())!;
  expect(
    Math.abs(centered.x + centered.width / 2 - cell.x - cell.width / 2),
  ).toBeLessThan(2);
  await page.getByLabel("Grid guides", { exact: true }).uncheck();
  await expect(preview.getByLabel("Grid guides")).toBeHidden();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("row drop position follows horizontal order above vertically centered items", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Preview connected", { exact: true }),
  ).toBeVisible();
  const library = page.getByLabel("Left component library");
  await library
    .getByRole("button", { name: "Insert Row", exact: true })
    .click();
  await library
    .getByRole("button", { name: "Insert Button", exact: true })
    .click();
  const row = page
    .frameLocator("iframe")
    .locator('[data-tweakloom-preset="row"]');
  await row.scrollIntoViewIfNeeded();
  await page.getByRole("tab", { name: "Insert", exact: true }).click();
  const source = (await page
    .getByLabel("Right component library")
    .getByRole("button", { name: "Insert Heading", exact: true })
    .boundingBox())!;
  const box = (await row.boundingBox())!;
  await page.mouse.move(source.x + 20, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(source.x - 25, source.y + 20, { steps: 5 });
  await page.mouse.move(box.x + box.width - 20, box.y + 25, { steps: 15 });
  await page.mouse.up();
  await expect(
    row.locator(":scope > [data-tweakloom-preset]").last(),
  ).toHaveAttribute("data-tweakloom-preset", "heading");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
