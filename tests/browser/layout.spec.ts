import { test, expect } from "@playwright/test";
import { rm } from "node:fs/promises";
test.beforeEach(async () => {
  await rm(".tweakloom/e2e", { recursive: true, force: true });
});

test("auto layout inserts without offsets, reorders, wraps and restores after save", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Preview connected", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Drag behavior")).toHaveValue("flow");
  const library = page.getByLabel("Left component library");
  const board = page.frameLocator("iframe").locator("#draft-board");
  await library
    .getByRole("button", { name: "Insert Button", exact: true })
    .click();
  await library
    .getByRole("button", { name: "Insert Heading", exact: true })
    .click();
  await expect(
    board.locator(":scope > [data-tweakloom-preset]").first(),
  ).toHaveAttribute("data-tweakloom-preset", "button");
  await page.getByRole("button", { name: "Move earlier", exact: true }).click();
  await expect(
    board.locator(":scope > [data-tweakloom-preset]").first(),
  ).toHaveAttribute("data-tweakloom-preset", "heading");
  await expect(board.locator('[data-tweakloom-preset="heading"]')).toHaveCSS(
    "translate",
    "none",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    board.locator(":scope > [data-tweakloom-preset]").first(),
  ).toHaveAttribute("data-tweakloom-preset", "button");
  await page.getByRole("button", { name: /draft board/i }).click();
  await page
    .getByRole("button", { name: "Column layout", exact: true })
    .click();
  await expect(board).toHaveCSS("flex-direction", "column");
  const a = (await board
    .locator('[data-tweakloom-preset="button"]')
    .boundingBox())!;
  const b = (await board
    .locator('[data-tweakloom-preset="heading"]')
    .boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(a.y + a.height + 17);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Saved · revision 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(board).toHaveCSS("flex-direction", "column");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("moves source siblings by dragging and restores exact order on Undo", async ({
  page,
}) => {
  await page.goto("/");
  const preview = page.frameLocator("iframe");
  const title = preview.locator('[data-tweakloom-id="hero-title"]');
  const target = preview.locator('[data-tweakloom-id="eyebrow"]');
  await title.scrollIntoViewIfNeeded();
  const a = (await title.boundingBox())!,
    b = (await target.boundingBox())!;
  await page.mouse.move(a.x + 20, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + 2, { steps: 10 });
  await expect(preview.getByLabel("Insertion guide")).toBeVisible();
  await page.mouse.up();
  await expect(
    preview
      .locator('[data-tweakloom-id="hero-content"] > [data-tweakloom-id]')
      .first(),
  ).toHaveAttribute("data-tweakloom-id", "hero-title");
  await expect(title).toHaveCSS("translate", "none");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    preview
      .locator('[data-tweakloom-id="hero-content"] > [data-tweakloom-id]')
      .first(),
  ).toHaveAttribute("data-tweakloom-id", "eyebrow");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("container rules reject controls in a card collection", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /collection cards/i }).click();
  await page
    .getByLabel("Left component library")
    .getByRole("button", { name: "Insert Button", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("accepts");
  await expect(
    page.frameLocator("iframe").locator('[data-tweakloom-preset="button"]'),
  ).toHaveCount(0);
});

test("drops new components into flow and moves them into a frame without losing order", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Preview connected", { exact: true }),
  ).toBeVisible();
  const library = page.getByLabel("Right component library");
  const preview = page.frameLocator("iframe"),
    board = preview.locator("#draft-board");
  await page
    .getByLabel("Left component library")
    .getByRole("button", { name: "Insert Button", exact: true })
    .click();
  await page.getByRole("tab", { name: "Insert", exact: true }).click();
  await board.scrollIntoViewIfNeeded();
  const first = board.locator('[data-tweakloom-preset="button"]');
  const source = (await library
    .getByRole("button", { name: "Insert Heading", exact: true })
    .boundingBox())!;
  const target = (await first.boundingBox())!;
  await page.mouse.move(source.x + 20, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(source.x - 25, source.y + 20, { steps: 5 });
  await page.mouse.move(target.x + 2, target.y + 10, { steps: 15 });
  await page.mouse.up();
  await expect(
    board.locator(":scope > [data-tweakloom-preset]").first(),
  ).toHaveAttribute("data-tweakloom-preset", "heading");
  await expect(first).toHaveCSS("translate", "none");
  await page.getByRole("button", { name: /draft board/i }).click();
  await page
    .getByLabel("Left component library")
    .getByRole("button", { name: "Insert Frame", exact: true })
    .click();
  const frame = board.locator('[data-tweakloom-preset="frame"]');
  await frame.scrollIntoViewIfNeeded();
  const a = (await first.boundingBox())!,
    b = (await frame.boundingBox())!;
  await page.mouse.move(a.x + 10, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 40, { steps: 15 });
  await page.mouse.up();
  await expect(frame.locator('[data-tweakloom-preset="button"]')).toHaveCount(
    1,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Saved · revision 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(frame.locator('[data-tweakloom-preset="button"]')).toHaveCount(
    1,
  );
  await expect(
    board.locator(":scope > [data-tweakloom-preset]").first(),
  ).toHaveAttribute("data-tweakloom-preset", "heading");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("moving a source element into a draft frame survives reload and frame removal restores it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const preview = page.frameLocator("iframe"),
    title = preview.locator('[data-tweakloom-id="hero-title"]');
  await title.click();
  await page
    .getByLabel("Left component library")
    .getByRole("button", { name: "Insert Frame", exact: true })
    .click();
  const frame = preview.locator('[data-tweakloom-preset="frame"]');
  const id = (await frame.getAttribute("data-tweakloom-id"))!;
  await title.scrollIntoViewIfNeeded();
  const a = (await title.boundingBox())!,
    b = (await frame.boundingBox())!;
  await page.mouse.move(a.x + 20, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 35, { steps: 20 });
  await page.mouse.up();
  await expect(frame.locator('[data-tweakloom-id="hero-title"]')).toHaveCount(
    1,
  );
  await page.getByLabel("Text color", { exact: true }).fill("#123456");
  await page.getByRole("button", { name: "Apply color", exact: true }).click();
  await expect(title).toHaveCSS("color", "rgb(18, 52, 86)");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Saved · revision 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(frame.locator('[data-tweakloom-id="hero-title"]')).toHaveCount(
    1,
  );
  await page
    .getByRole("button", { name: `Remove ${id}:insert`, exact: true })
    .click();
  await expect(
    preview.locator(
      '[data-tweakloom-id="hero-content"] > [data-tweakloom-id="hero-title"]',
    ),
  ).toHaveCount(1);
  await expect(title).toHaveCSS("color", "rgb(18, 52, 86)");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});
