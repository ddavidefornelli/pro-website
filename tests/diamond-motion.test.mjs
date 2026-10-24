import test from "node:test";
import assert from "node:assert/strict";
import { createDiamondRain, advanceDiamond, celebrationGlow } from "../src/planner/diamond-motion.ts";

function seededRandom(seed = 42) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test("diamond rain: independent random entry times cover both sides, not a horizontal sweep", () => {
  const gems = createDiamondRain(1440, seededRandom());
  const byEntry = [...gems].sort((a, b) => a.releaseAt - b.releaseAt);
  assert.equal(new Set(gems.map((gem) => gem.releaseAt)).size, gems.length);
  assert.ok(byEntry.at(-1).releaseAt - byEntry[0].releaseAt > 1.5);
  for (const group of [byEntry.slice(0, 18), byEntry.slice(18, 36), byEntry.slice(36, 54)]) {
    assert.ok(group.some((gem) => gem.x < 1440 / 3));
    assert.ok(group.some((gem) => gem.x > 1440 * 2 / 3));
  }
});

test("diamond rain: every gem starts above the screen and falls vertically without tumbling", () => {
  const gems = createDiamondRain(390, seededRandom());
  for (const gem of gems) {
    const { x, angle, releaseAt, duration } = gem;
    assert.ok(gem.y + gem.size <= 0);
    assert.ok(Math.abs(angle) <= .15);
    let lastY = gem.y;
    for (let step = 0; step < 20; step++) {
      const elapsed = releaseAt + duration * step / 20;
      assert.equal(advanceDiamond(gem, elapsed, 844), true);
      assert.equal(gem.x, x, "horizontal position must not change during a fall");
      assert.equal(gem.angle, angle, "orientation must not tumble or flip");
      assert.ok(gem.y >= lastY);
      lastY = gem.y;
    }
  }
});

test("diamond rain: one phase only, finished diamonds never restart", () => {
  const gems = createDiamondRain(1024, seededRandom());
  for (const gem of gems) {
    const { releaseAt, duration } = gem;
    assert.ok(releaseAt >= 0 && releaseAt < 2.6);
    assert.equal(advanceDiamond(gem, releaseAt + duration - .01, 768), true);
    const finalY = gem.y;
    for (const elapsed of [releaseAt + duration + .01, 8, 10]) {
      assert.equal(advanceDiamond(gem, elapsed, 768), false);
      assert.equal(gem.releaseAt, releaseAt, "must not schedule a second entry");
      assert.equal(gem.y, finalY, "must not reset a finished diamond to the top");
    }
  }
});

test("diamond rain: bounded particle count; every cut has subtle illumination", () => {
  for (const width of [320, 390, 1024, 1440, 3840]) {
    const gems = createDiamondRain(width, seededRandom());
    assert.ok(gems.length >= 72 && gems.length <= 168);
    assert.deepEqual([...new Set(gems.map((gem) => gem.cut))].sort(), [0, 1, 2]);
    for (const gem of gems) {
      assert.ok(gem.light >= .04 && gem.light <= .15);
      assert.equal(advanceDiamond(gem, 10, 844), false);
    }
  }
});

test("diamond rain: emerald cuts are rare, larger and more luminous without adding particles", () => {
  for (const width of [320, 390, 1440, 3840]) {
    const gems = createDiamondRain(width, seededRandom());
    const emeralds = gems.filter((gem) => gem.cut === 1);
    assert.ok(emeralds.length >= 1);
    assert.ok(emeralds.length / gems.length <= .2);
    for (const gem of emeralds) {
      assert.ok(gem.size >= 78 && gem.size <= 94);
      assert.equal(gem.opacity, .98);
      assert.equal(gem.light, .15);
    }
    assert.ok(gems.filter((gem) => gem.cut !== 1).every((gem) => gem.light <= .12));
  }
});

test("diamond rain: cut and light strength stay constant throughout the single fall", () => {
  for (const gem of createDiamondRain(390, seededRandom())) {
    const { cut, light, x } = gem;
    for (const progress of [0, .25, .5, .75, .99]) {
      advanceDiamond(gem, gem.releaseAt + gem.duration * progress, 844);
      assert.equal(gem.cut, cut);
      assert.equal(gem.light, light);
      assert.equal(gem.x, x);
    }
  }
});

test("diamond rain: each stone catches one smooth, independently timed facet reflection", () => {
  const gems = createDiamondRain(1440, seededRandom());
  assert.equal(new Set(gems.map((gem) => gem.reflectionAt)).size, gems.length);
  assert.deepEqual([...new Set(gems.map((gem) => gem.reflectionVariant))].sort(), [0, 1]);
  for (const gem of gems) {
    const { x, angle, reflectionAt, reflectionDuration, releaseAt } = gem;
    assert.ok(reflectionAt + reflectionDuration < gem.duration);
    for (const age of [-.1, 0, reflectionAt, reflectionAt + reflectionDuration + .01]) {
      advanceDiamond(gem, releaseAt + age, 844);
      assert.ok(gem.reflection < 1e-20);
    }
    advanceDiamond(gem, releaseAt + reflectionAt + reflectionDuration / 4, 844);
    assert.ok(Math.abs(gem.reflection - .5) < 1e-10);
    advanceDiamond(gem, releaseAt + reflectionAt + reflectionDuration / 2, 844);
    assert.ok(Math.abs(gem.reflection - 1) < 1e-10);
    assert.equal(gem.x, x);
    assert.equal(gem.angle, angle);
    assert.equal(advanceDiamond(gem, releaseAt + gem.duration + .01, 844), false);
    assert.equal(gem.reflection, 0);
  }
});

test("diamond rain: large gems carry wide pools of light, small gems have tight illumination", () => {
  const gems = createDiamondRain(1440, seededRandom());
  const small = gems.filter((gem) => gem.size < 60);
  const large = gems.filter((gem) => gem.size >= 60);
  assert.ok(small.length && large.length);
  assert.ok(Math.max(...small.map((gem) => gem.lightRadius)) < Math.min(...large.map((gem) => gem.lightRadius)));
  for (const gem of gems) {
    const radius = gem.lightRadius;
    advanceDiamond(gem, gem.releaseAt + gem.duration / 2, 844);
    assert.equal(gem.lightRadius, radius);
    assert.ok(radius < 190, "keep lighting fill rate bounded");
  }
});

test("diamond rain: the celebration fills the width and reaches across the screen in one continuous fall", () => {
  for (const [width, height] of [[320, 844], [390, 844], [1440, 900], [2560, 1440]]) {
    const gems = createDiamondRain(width, seededRandom());
    const columns = Math.max(4, Math.ceil(width / 100));
    const distribution = Array(columns).fill(0);
    const visible = [];
    for (const gem of gems) {
      distribution[Math.min(columns - 1, Math.floor(gem.x / width * columns))]++;
      if (advanceDiamond(gem, 3.2, height) && gem.y + gem.size * .45 > 0 && gem.y - gem.size * .45 < height) visible.push(gem);
    }
    assert.ok(Math.max(...distribution) - Math.min(...distribution) <= 1);
    assert.ok(visible.length > gems.length * .85);
    assert.ok(Math.min(...visible.map((gem) => gem.y)) < height * .2);
    assert.ok(Math.max(...visible.map((gem) => gem.y)) > height * .7);
    const firstExit = Math.min(...gems.map((gem) => gem.releaseAt + gem.duration));
    assert.ok(gems.every((gem) => gem.releaseAt < firstExit));
  }
});

test("diamond rain: completion lighting rises gently and fades once without flashing", () => {
  assert.equal(celebrationGlow(-1), 0);
  assert.equal(celebrationGlow(0), 0);
  assert.ok(celebrationGlow(.4) > 0);
  assert.ok(celebrationGlow(.4) < celebrationGlow(.8));
  assert.equal(celebrationGlow(.8), .06);
  assert.ok(celebrationGlow(4) > celebrationGlow(6));
  assert.equal(celebrationGlow(7), 0);
  assert.equal(celebrationGlow(10), 0);
  for (let time = 0; time <= 10; time += .1) assert.ok(celebrationGlow(time) >= 0 && celebrationGlow(time) <= .06);
});
