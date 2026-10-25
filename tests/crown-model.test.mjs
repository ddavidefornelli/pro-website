import assert from "node:assert/strict";
import { test } from "node:test";
import { Box3, Mesh } from "three";
import { CROWN_POINTS, createCrownModel, crownProfile } from "../src/planner/crown-model.ts";

test("crown model: five evenly spaced points with concave valleys and outward-flaring tips", () => {
  assert.equal(CROWN_POINTS, 5);
  for (let point = 0; point < CROWN_POINTS; point++) {
    const angle = point / CROWN_POINTS * Math.PI * 2;
    const peak = crownProfile(angle);
    const valley = crownProfile(angle + Math.PI / CROWN_POINTS);
    assert.ok(Math.abs(peak.height - 1.08) < 1e-10);
    assert.ok(Math.abs(valley.height - .04) < 1e-10);
    assert.ok(peak.radius > valley.radius);
    assert.ok(crownProfile(angle + .2).height < (peak.height + valley.height) / 2);
  }
});

test("crown model: genuine, bounded 3D geometry with an interior, rounded rim and five spherical tips", () => {
  const crown = createCrownModel();
  try {
    assert.ok(crown.object.getObjectByName("outer-shell") instanceof Mesh);
    assert.ok(crown.object.getObjectByName("inner-shell") instanceof Mesh);
    assert.ok(crown.object.getObjectByName("rolled-base-band") instanceof Mesh);
    assert.ok(crown.object.getObjectByName("rounded-scalloped-edge") instanceof Mesh);
    const tips = [];
    let triangles = 0;
    crown.object.traverse(child => {
      if (!(child instanceof Mesh)) return;
      if (child.name.startsWith("rounded-tip-")) tips.push(child);
      const positions = child.geometry.getAttribute("position");
      const normals = child.geometry.getAttribute("normal");
      assert.equal(normals.count, positions.count);
      assert.ok(Array.from(positions.array).every(Number.isFinite));
      assert.ok(Array.from(normals.array).every(Number.isFinite));
      assert.equal(child.material.metalness, 1);
      triangles += child.geometry.index.count / 3;
    });
    assert.equal(tips.length, 5);
    assert.ok(triangles < 60000, `Unnecessarily heavy crown: ${triangles} triangles`);
    const bounds = new Box3().setFromObject(crown.object);
    assert.ok(bounds.min.x < -1 && bounds.max.x > 1);
    assert.ok(bounds.min.z < -1 && bounds.max.z > 1);
    assert.ok(bounds.min.y > -1 && bounds.max.y < 1.1);
  } finally { crown.dispose(); }
});

test("crown model: all GPU resources are released once, including shared sphere geometry", () => {
  const crown = createCrownModel();
  const resources = new Set();
  crown.object.traverse(child => {
    if (child instanceof Mesh) { resources.add(child.geometry); resources.add(child.material); }
  });
  const disposed = new Map();
  for (const resource of resources) resource.addEventListener("dispose", () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  crown.dispose();
  assert.equal(disposed.size, resources.size);
  for (const count of disposed.values()) assert.equal(count, 1);
});
