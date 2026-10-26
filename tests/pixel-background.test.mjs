import test from "node:test";
import assert from "node:assert/strict";
import {
  createPixelCells, pixelAlpha, PIXEL_COLUMNS, PIXEL_ROWS, PIXEL_SIZE,
  PIXEL_WIDTH, PIXEL_HEIGHT, PIXEL_REVEAL_DURATION, PIXEL_FRAME_INTERVAL,
} from "../src/shared/pixel-background.ts";

const cells = createPixelCells();

test("four times as many pixels keep deterministic positions and cumulative clusters", () => {
  assert.equal(cells.length, 12800);
  assert.equal(cells.length, 4 * 80 * 40);
  assert.deepEqual(createPixelCells(), cells);
  assert.equal(PIXEL_WIDTH / PIXEL_HEIGHT, 2);
  assert.equal(PIXEL_WIDTH, PIXEL_COLUMNS * PIXEL_SIZE);
  assert.equal(PIXEL_HEIGHT, PIXEL_ROWS * PIXEL_SIZE);
  assert.equal(new Set(cells.map(({ x, y }) => `${x},${y}`)).size, cells.length);
  for (const cell of cells) {
    assert.ok(cell.x >= 1 && cell.x + PIXEL_SIZE - 1 <= PIXEL_WIDTH);
    assert.ok(cell.y >= 1 && cell.y + PIXEL_SIZE - 1 <= PIXEL_HEIGHT);
    assert.ok([1, 2, 3].includes(cell.tier));
  }
  const counts = [1, 2, 3].map((level) => cells.filter((cell) => cell.tier <= level).length);
  assert.ok(counts[0] > 0 && counts[0] < counts[1] && counts[1] < counts[2]);
  assert.equal(counts[2], cells.length);
});

test("early levels light roughly one-third and two-thirds of the grid, including outside clusters", () => {
  const coverage = [1, 2].map((level) => cells.filter((cell) => cell.tier <= level).length / cells.length);
  assert.ok(coverage[0] >= 0.30 && coverage[0] <= 0.40);
  assert.ok(coverage[1] >= 0.65 && coverage[1] <= 0.75);
  // Every region should participate, not just the central clusters. This also
  // keeps the cropped artwork on narrow phones from looking nearly empty.
  for (let row = 0; row < PIXEL_ROWS; row += 20) {
    for (let column = 0; column < PIXEL_COLUMNS; column += 20) {
      const region = cells.filter((cell) =>
        cell.x >= column * PIXEL_SIZE && cell.x < (column + 20) * PIXEL_SIZE
        && cell.y >= row * PIXEL_SIZE && cell.y < (row + 20) * PIXEL_SIZE);
      assert.ok(region.filter((cell) => cell.tier === 1).length / region.length >= 0.25);
      assert.ok(region.filter((cell) => cell.tier <= 2).length / region.length >= 0.60);
    }
  }
});

test("independent charging takes 60–140 seconds, with varied phases and intensity", () => {
  assert.ok(new Set(cells.map((cell) => cell.duration)).size > 1000);
  assert.ok(new Set(cells.map((cell) => cell.phase)).size > 1000);
  for (const cell of cells) {
    assert.ok(cell.duration >= 60000 && cell.duration <= 140000);
    assert.ok(cell.phase >= 0 && cell.phase <= cell.duration);
    assert.ok(cell.intensity >= 0.35 && cell.intensity <= 1);
    assert.ok(cell.delay >= 0 && cell.delay <= 1800);
  }
});

test("reveal is delayed and eased; reduced motion is immediately static", () => {
  const cell = { ...cells[0], delay: 1000, duration: 100000, phase: 60000, intensity: 1 };
  assert.equal(pixelAlpha(cell, 0, false), 0);
  assert.equal(pixelAlpha(cell, cell.delay, false), 0);
  assert.equal(pixelAlpha(cell, cell.delay + PIXEL_REVEAL_DURATION / 2, false), 128);
  assert.equal(pixelAlpha(cell, cell.delay + PIXEL_REVEAL_DURATION, false), 255);
  for (const elapsed of [0, 1000, 10000, 100000]) {
    assert.equal(pixelAlpha(cell, elapsed, true), 255);
  }
});

test("ambient brightness eases without flashes and repeats without a jump", () => {
  const cell = { ...cells[0], delay: 0, duration: 100000, phase: 0, intensity: 1 };
  assert.equal(pixelAlpha(cell, 54000, false), 255);
  assert.equal(pixelAlpha(cell, 65000, false), 255);
  assert.equal(pixelAlpha(cell, 100000, false), Math.round(0.12 * 255));
  assert.equal(pixelAlpha(cell, 99999, false), pixelAlpha(cell, 100000, false));
  assert.equal(pixelAlpha(cell, 12345, false), pixelAlpha(cell, 112345, false));
  for (const elapsed of [5000, 30000, 60000, 100000, 180000]) {
    let unchanged = 0;
    for (const cell of cells) {
      const alpha = pixelAlpha(cell, elapsed, false);
      const next = pixelAlpha(cell, elapsed + PIXEL_FRAME_INTERVAL, false);
      assert.ok(alpha > 0 && alpha <= 255);
      // Even the fastest cell changes by at most 2/255 per rendering interval.
      assert.ok(Math.abs(next - alpha) <= 2);
      if (next === alpha) unchanged++;
    }
    assert.ok(unchanged > cells.length / 2, "most cells can skip painting on each update");
  }
});
