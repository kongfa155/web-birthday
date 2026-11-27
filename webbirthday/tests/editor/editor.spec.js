import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { normalizeDomDesign } from "../../shared/designSchema.js";

const CARD_ID = "222222222222222222222222";
const TEMPLATE_ID = "333333333333333333333333";
const SOURCE = "https://design.test/card.json";
const TOKEN = "a".repeat(43);
const fixtureDesign = () => normalizeDomDesign({
  schemaVersion: 1, width: 1080, height: 1440, background: "#fff1f5",
  elements: [{ id: "greeting", type: "text", text: "Chúc mừng sinh nhật!", x: 100, y: 120, width: 850, height: 240, fontSize: 64, textAlign: "center", color: "#be123c" }],
});

async function setup(page, options = {}) {
  const state = {
    design: fixtureDesign(), saves: [], failSave: false, invalid: false,
    record: { _id: CARD_ID, cardName: "Thiệp của tôi", designFormat: "dom", designUrl: SOURCE },
    ...options,
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("token", "fixture-token"));
  await page.route("https://design.test/**", (route) => route.fulfill({
    headers: { "Access-Control-Allow-Origin": "*" }, json: state.invalid ? { broken: true } : state.design,
  }));
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/users/me") return route.fulfill({ json: { user: { _id: "111111111111111111111111", username: "admin", isAdmin: true, isActive: true } } });
    if (path.startsWith("/api/shared-cards/")) return route.fulfill({ status: state.revoked ? 404 : 200, json: state.revoked ? { message: "Liên kết đã bị thu hồi." } : state.record });
    if (["POST", "PUT"].includes(req.method()) && (path.startsWith("/api/cards") || path.startsWith("/api/templates"))) {
      const body = req.postDataJSON();
      state.saves.push({ method: req.method(), path, body });
      if (state.failSave) return route.fulfill({ status: 500, json: { message: "Không thể lưu thiết kế. Vui lòng thử lại." } });
      if (body.design) {
        // Contract validation catches UI/backend disagreements during real browser saves.
        state.design = normalizeDomDesign(body.design);
        expect(body.preview).toMatch(/^data:image\/png;base64,/);
      }
      return route.fulfill({ json: path.startsWith("/api/templates") ? { template: { _id: TEMPLATE_ID, name: body.name, designFormat: "dom", designUrl: SOURCE } } : { card: { ...state.record, ...body } } });
    }
    if (path.startsWith("/api/cards/")) return route.fulfill({ json: state.record });
    if (path.startsWith("/api/templates/")) return route.fulfill({ json: { ...state.record, _id: TEMPLATE_ID, name: "Mẫu sinh nhật" } });
    if (path === "/api/cards" || path === "/api/templates") return route.fulfill({ json: { items: [], nextCursor: null } });
    return route.fulfill({ status: 404, json: { message: "Unknown test endpoint" } });
  });
  return { state, errors };
}

test("native editor opens a real DOM design without SDK keys", async ({ page }) => {
  const { errors } = await setup(page);
  await page.goto(`/edit/cards/${CARD_ID}`);
  await expect(page.getByRole("button", { name: "Lưu thiết kế", exact: true })).toBeEnabled();
  await expect(page.locator('[data-element-type="text"]').first()).toContainText("Chúc mừng sinh nhật!");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("save exports a PNG preview and sends valid native document", async ({ page }) => {
  const { state, errors } = await setup(page);
  await page.goto(`/edit/cards/${CARD_ID}`);
  const name = page.getByRole("textbox", { name: "Tên thiết kế", exact: true });
  await name.fill("Thiệp tặng bạn thân");
  await page.getByRole("button", { name: "Lưu thiết kế", exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.saves[0].body.cardName).toBe("Thiệp tặng bạn thân");
  expect(state.saves[0].body.design.schemaVersion).toBe(1);
  expect(state.saves[0].body.design.elements[0].text).toBe("Chúc mừng sinh nhật!");
  await expect(page.getByRole("button", { name: "Lưu thiết kế", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("failed save keeps the edited document available for retry", async ({ page }) => {
  const { state } = await setup(page, { failSave: true });
  await page.goto(`/edit/cards/${CARD_ID}`);
  const name = page.getByRole("textbox", { name: "Tên thiết kế", exact: true });
  await name.fill("Nội dung chưa lưu");
  await page.getByRole("button", { name: "Lưu thiết kế", exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(1);
  await expect(page.getByText("Không thể lưu thiết kế. Vui lòng thử lại.", { exact: true }).first()).toBeVisible();
  await expect(name).toHaveValue("Nội dung chưa lưu");
  state.failSave = false;
  await page.getByRole("button", { name: "Lưu thiết kế", exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(2);
});

test("invalid design cannot become a blank editable document", async ({ page }) => {
  const { state } = await setup(page, { invalid: true });
  await page.goto(`/edit/cards/${CARD_ID}`);
  await expect(page.getByRole("heading", { name: "Không thể tải thiết kế" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu thiết kế", exact: true })).toHaveCount(0);
  expect(state.saves).toHaveLength(0);
});

test("public DOM share is read-only, responsive and keeps privacy metadata", async ({ page }) => {
  const { errors } = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/share/${TOKEN}`);
  await expect(page.locator('[data-element-id="greeting"]')).toContainText("Chúc mừng sinh nhật!");
  await expect(page.getByRole("button", { name: "Lưu thiết kế", exact: true })).toHaveCount(0);
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("legacy Fabric share still renders and revoked links fail", async ({ page }) => {
  const { state, errors } = await setup(page, { record: { cardName: "Thiệp cũ", fabricEdit: { objects: [{ type: "Textbox", left: 0, top: 0, width: 600, text: "Sinh nhật vui vẻ!", fontFamily: "Arial", fontSize: 48 }] } } });
  await page.goto(`/share/${TOKEN}`);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu thiết kế", exact: true })).toHaveCount(0);
  state.revoked = true;
  await page.goto(`/share/${"b".repeat(43)}`);
  await expect(page.getByRole("heading", { name: "Không thể mở thiệp" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("first template save switches to the created ID and subsequent saves use PUT", async ({ page }) => {
  const { state } = await setup(page);
  await page.goto("/edit/templates/blank");
  await page.getByRole("textbox", { name: "Tên thiết kế", exact: true }).fill("Mẫu mới");
  await page.getByRole("button", { name: "Lưu thiết kế", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/edit/templates/${TEMPLATE_ID}$`));
  await page.getByRole("button", { name: "Lưu thiết kế", exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(2);
  expect(state.saves[0].method).toBe("POST");
  expect(state.saves[1].method).toBe("PUT");
});

test("Moveable drag uses logical coordinates at zoom and supports undo/redo", async ({ page }) => {
  await setup(page);
  await page.goto(`/edit/cards/${CARD_ID}`);
  const element = page.locator('[data-element-type="text"]').first();
  await element.click();
  await expect(page.locator(".moveable-control-box")).toBeVisible();
  const initial = await element.evaluate((node) => ({ x: parseFloat(node.style.left), y: parseFloat(node.style.top), scale: node.getBoundingClientRect().width / parseFloat(node.style.width) }));
  const box = await element.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  const moved = await element.evaluate((node) => ({ x: parseFloat(node.style.left), y: parseFloat(node.style.top) }));
  expect(moved.x - initial.x).toBeCloseTo(60 / initial.scale, -1);
  expect(moved.y - initial.y).toBeCloseTo(40 / initial.scale, -1);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect.poll(() => element.evaluate((node) => parseFloat(node.style.left))).toBe(initial.x);
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  await expect.poll(() => element.evaluate((node) => parseFloat(node.style.left))).toBe(moved.x);
});

test("text inspector edits Vietnamese content and mobile editor stays within viewport", async ({ page }) => {
  const { state } = await setup(page);
  await page.goto(`/edit/cards/${CARD_ID}`);
  const element = page.locator('[data-element-type="text"]').first();
  await element.click();
  await page.getByRole("textbox", { name: "Nội dung chữ", exact: true }).fill("Chúc bạn tuổi mới nhiều niềm vui!");
  await expect(element).toContainText("Chúc bạn tuổi mới nhiều niềm vui!");
  await page.getByRole("button", { name: "Lưu thiết kế", exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.saves[0].body.design.elements[0].text).toBe("Chúc bạn tuổi mới nhiều niềm vui!");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Lưu thiết kế", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(async () => {
    const target = await element.boundingBox();
    const control = await page.locator(".moveable-control.moveable-nw").boundingBox();
    return control ? Math.abs(control.x + control.width / 2 - target.x) + Math.abs(control.y + control.height / 2 - target.y) : Infinity;
  }).toBeLessThan(6);
  await page.screenshot({ path: "test-results/editor-mobile.png", fullPage: true });
});

test("Moveable resize and rotate persist dimensions and angle", async ({ page }) => {
  const { state } = await setup(page);
  await page.goto(`/edit/cards/${CARD_ID}`);
  const element = page.locator('[data-element-type="text"]').first();
  await element.click();
  const scale = await element.evaluate((node) => node.getBoundingClientRect().width / parseFloat(node.style.width));
  const corner = page.locator(".moveable-control.moveable-se");
  await expect(corner).toBeVisible();
  const resize = await corner.boundingBox();
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
  await page.mouse.down();
  await page.mouse.move(resize.x + resize.width / 2 + 50, resize.y + resize.height / 2 + 35, { steps: 8 });
  await page.mouse.up();
  const width = await element.evaluate((node) => parseFloat(node.style.width));
  expect(width).toBeCloseTo(850 + 50 / scale, -1);
  const rotation = page.locator(".moveable-rotation-control");
  await expect(rotation).toBeVisible();
  const handle = await rotation.boundingBox();
  const box = await element.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const sx = handle.x + handle.width / 2, sy = handle.y + handle.height / 2;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    const angle = Math.PI / 4 * step / 8;
    await page.mouse.move(cx + (sx - cx) * Math.cos(angle) - (sy - cy) * Math.sin(angle), cy + (sx - cx) * Math.sin(angle) + (sy - cy) * Math.cos(angle));
  }
  await page.mouse.up();
  await page.getByRole("button", { name: "Lưu thiết kế", exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.saves[0].body.design.elements[0].width).toBe(width);
  expect(state.saves[0].body.design.elements[0].rotation).toBeCloseTo(45, -1);
});

test("birthday template renders and downloads PNG at full logical resolution", async ({ page }) => {
  await setup(page);
  await page.goto(`/edit/cards/${CARD_ID}`);
  await page.getByRole("button", { name: /Sinh Nhật Rực Rỡ/ }).click();
  await page.getByRole("button", { name: "Áp dụng mẫu", exact: true }).click();
  await expect(page.locator('[data-element-type="text"]')).not.toHaveCount(0);
  await page.screenshot({ path: "test-results/editor-desktop.png", fullPage: true });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tải PNG", exact: true }).click();
  const file = await downloadPromise;
  const png = await readFile(await file.path());
  expect(png.readUInt32BE(16)).toBe(2160);
  expect(png.readUInt32BE(20)).toBe(2880);
});

test("image upload uses authenticated API and persists fit settings", async ({ page }) => {
  const { state } = await setup(page);
  await page.goto(`/edit/cards/${CARD_ID}`);
  await page.getByRole("button", { name: "Ảnh", exact: true }).click();
  const imageData = await page.evaluate(() => {
    const raster = document.createElement("canvas"); raster.width = 40; raster.height = 30;
    const context = raster.getContext("2d"); context.fillStyle = "#e11d48"; context.fillRect(0, 0, 40, 30);
    return raster.toDataURL("image/png");
  });
  const bytes = Buffer.from(imageData.split(",")[1], "base64");
  await page.route("https://images.test/photo.png", (route) => route.fulfill({ contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" }, body: bytes }));
  let uploads = 0;
  await page.route("**/api/upload-base64", (route) => {
    uploads++;
    expect(route.request().headers().authorization).toBe("Bearer fixture-token");
    expect(route.request().postDataJSON().base64).toMatch(/^data:image\/png;base64,/);
    return route.fulfill({ json: { url: "https://images.test/photo.png" } });
  });
  await page.locator('input[type="file"]').first().setInputFiles({ name: "birthday.png", mimeType: "image/png", buffer: bytes });
  const image = page.locator('[data-element-type="image"]');
  await expect(image).toHaveCount(1);
  await page.getByRole("button", { name: "Vừa khung (Contain)", exact: true }).click();
  await page.getByRole("button", { name: "Lưu thiết kế", exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(1);
  expect(uploads).toBe(1);
  expect(state.saves[0].body.design.elements.find((item) => item.type === "image")).toMatchObject({ src: "https://images.test/photo.png", objectFit: "contain" });
});

test("broken image fails viewing and saving instead of silently producing a blank image", async ({ page }) => {
  const { state } = await setup(page);
  state.design = normalizeDomDesign({ ...fixtureDesign(), elements: [{ id: "broken-photo", type: "image", src: "https://images.test/missing.png" }] });
  await page.route("https://images.test/missing.png", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.goto(`/share/${TOKEN}`);
  await expect(page.getByRole("heading", { name: "Không thể hiển thị thiệp" })).toBeVisible();
  await page.goto(`/edit/cards/${CARD_ID}`);
  await page.getByRole("button", { name: "Lưu thiết kế", exact: true }).click();
  await expect(page.getByRole("alert").first()).toContainText("Không thể tải");
  expect(state.saves).toHaveLength(0);
});

test("history coalesces edits within 600ms and a new edit discards redo", async ({ page }) => {
  await setup(page);
  await page.goto(`/edit/cards/${CARD_ID}`);
  const element = page.locator('[data-element-id="greeting"]');
  await element.click();
  const input = page.getByRole("textbox", { name: "Nội dung chữ", exact: true });
  const undo = page.getByRole("button", { name: "Hoàn tác", exact: true });
  const redo = page.getByRole("button", { name: "Làm lại", exact: true });

  await page.clock.setFixedTime(new Date("2026-11-27T00:00:00.000Z"));
  await input.fill("Lời chúc thứ nhất");
  await page.clock.setFixedTime(new Date("2026-11-27T00:00:00.599Z"));
  await input.fill("Lời chúc thứ hai");
  await undo.click();
  await expect(element).toContainText("Chúc mừng sinh nhật!");
  await expect(undo).toBeDisabled();
  await redo.click();
  await expect(element).toContainText("Lời chúc thứ hai");

  await page.clock.setFixedTime(new Date("2026-11-27T00:00:02.000Z"));
  await input.fill("Một bước riêng");
  await page.clock.setFixedTime(new Date("2026-11-27T00:00:02.600Z"));
  await input.fill("Đúng ngưỡng 600ms");
  await undo.click();
  await expect(element).toContainText("Một bước riêng");
  await expect(redo).toBeEnabled();
  await input.fill("Nhánh chỉnh sửa mới");
  await expect(redo).toBeDisabled();
});

test("history retains only the latest 60 undo steps", async ({ page }) => {
  test.setTimeout(60000);
  await setup(page);
  await page.goto(`/edit/cards/${CARD_ID}`);
  const element = page.locator('[data-element-id="greeting"]');
  await element.click();
  const input = page.getByRole("textbox", { name: "Nội dung chữ", exact: true });
  const undo = page.getByRole("button", { name: "Hoàn tác", exact: true });
  const start = Date.UTC(2026, 10, 27);
  for (let step = 1; step <= 62; step++) {
    await page.clock.setFixedTime(new Date(start + step * 1000));
    await input.fill(`Lời chúc phiên bản ${step}`);
  }
  await expect(element).toContainText("Lời chúc phiên bản 62");
  for (let step = 0; step < 60; step++) await undo.click();
  await expect(element).toContainText("Lời chúc phiên bản 2");
  await expect(undo).toBeDisabled();
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  await expect(element).toContainText("Lời chúc phiên bản 3");
});

test("unsaved changes confirmation can cancel navigation and save survives reload", async ({ page }) => {
  const { state } = await setup(page);
  await page.goto(`/edit/cards/${CARD_ID}`);
  const element = page.locator('[data-element-id="greeting"]');
  await element.click();
  await page.getByRole("textbox", { name: "Nội dung chữ", exact: true }).fill("Lời chúc cần giữ lại");
  await page.getByRole("button", { name: "Quay lại", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Rời khỏi trình chỉnh sửa?");
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(element).toContainText("Lời chúc cần giữ lại");
  await page.getByRole("button", { name: "Lưu thiết kế", exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(1);
  await expect(page.getByText("Đã lưu", { exact: true })).toBeVisible();
  await page.reload();
  await expect(element).toContainText("Lời chúc cần giữ lại");
  await expect(page.getByText("Đã lưu", { exact: true })).toBeVisible();
});
