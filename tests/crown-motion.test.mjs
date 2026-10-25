import assert from "node:assert/strict";
import { test } from "node:test";
import { CROWN_DURATION, crownFrame } from "../src/planner/crown-motion.ts";

test("crown: one gentle entrance and exit, with no flash or second wave", () => {
  assert.equal(crownFrame(0).opacity, 0);
  assert.equal(crownFrame(-1).opacity, 0);
  let previous = 0;
  for (let time = 0; time <= .8; time += .02) {
    const { opacity } = crownFrame(time);
    assert.ok(opacity >= previous && opacity <= 1);
    previous = opacity;
  }
  assert.equal(crownFrame(1).opacity, 1);
  assert.equal(crownFrame(6).opacity, 1);
  previous = 1;
  for (let time = CROWN_DURATION - 1.1; time <= CROWN_DURATION; time += .02) {
    const { opacity } = crownFrame(time);
    assert.ok(opacity <= previous && opacity >= 0);
    previous = opacity;
  }
  assert.equal(crownFrame(CROWN_DURATION).opacity, 0);
});

test("crown: a steady full 3D revolution, independent of frame rate", () => {
  const initial = crownFrame(0).rotationY;
  assert.ok(Math.abs(crownFrame(6.4).rotationY - initial - 2 * Math.PI) < 1e-10);
  for (const fps of [30, 60, 120]) {
    let previous = initial;
    for (let frame = 1; frame < CROWN_DURATION * fps; frame++) {
      const { rotationY } = crownFrame(frame / fps);
      assert.ok(rotationY > previous);
      assert.ok(Math.abs(rotationY - previous - 2 * Math.PI / (6.4 * fps)) < 1e-10);
      previous = rotationY;
    }
  }
});

test("crown: floating and tilt are subtle, never tumbling or leaving the frame", () => {
  for (let time = 0; time < CROWN_DURATION; time += .03) {
    const pose = crownFrame(time);
    assert.ok(Math.abs(pose.y) <= .055);
    assert.ok(Math.abs(pose.rotationX) < .24);
    assert.ok(Math.abs(pose.rotationZ) < .11);
    assert.ok(pose.scale >= .88 && pose.scale <= 1);
    assert.equal(pose.finished, false);
  }
});

test("crown: finished celebrations never restart", () => {
  for (const time of [CROWN_DURATION, 10, 100, 3600]) {
    assert.equal(crownFrame(time).finished, true);
    assert.equal(crownFrame(time).opacity, 0);
  }
});
