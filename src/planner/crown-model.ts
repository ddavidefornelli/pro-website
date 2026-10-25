import {
  BufferGeometry, Curve, Float32BufferAttribute, Group, LatheGeometry,
  Mesh, MeshPhysicalMaterial, SphereGeometry, TorusGeometry, TubeGeometry,
  Vector2, Vector3,
} from "three";

export const CROWN_POINTS = 5;
const TAU = Math.PI * 2;
const BASE_Y = -.57;
const WALL_THICKNESS = .035;
const ANGULAR_SEGMENTS = 320;
const HEIGHT_SEGMENTS = 24;

/** A concave scallop, not a zigzag: the points grow out of a continuous band. */
export function crownProfile(angle: number) {
  const point = Math.max(0, 1 - Math.abs(Math.sin(angle * CROWN_POINTS / 2)));
  const height = .04 + 1.04 * Math.pow(point, 1.3);
  return { height, radius: crownRadius(height) };
}

function crownRadius(height: number): number {
  const flare = Math.max(0, (height + .3) / 1.38);
  return .99 + .24 * Math.pow(flare, 1.7) + .025 * Math.exp(-(height + .57) / .1);
}

function shellGeometry(inside: boolean): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let column = 0; column < ANGULAR_SEGMENTS; column++) {
    const angle = column / ANGULAR_SEGMENTS * TAU;
    const top = crownProfile(angle).height;
    for (let row = 0; row <= HEIGHT_SEGMENTS; row++) {
      const y = BASE_Y + (top - BASE_Y) * row / HEIGHT_SEGMENTS;
      const radius = crownRadius(y) - (inside ? WALL_THICKNESS : 0);
      positions.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
    }
  }
  // Wrap the indices rather than duplicating the seam, keeping normals smooth.
  for (let column = 0; column < ANGULAR_SEGMENTS; column++) {
    const next = (column + 1) % ANGULAR_SEGMENTS;
    for (let row = 0; row < HEIGHT_SEGMENTS; row++) {
      const a = column * (HEIGHT_SEGMENTS + 1) + row;
      const b = next * (HEIGHT_SEGMENTS + 1) + row;
      if (inside) indices.push(a, a + 1, b, b, a + 1, b + 1);
      else indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

class CrownEdge extends Curve<Vector3> {
  constructor() { super(); }

  getPoint(t: number, target = new Vector3()): Vector3 {
    const angle = t * TAU;
    const { height, radius } = crownProfile(angle);
    return target.set(
      Math.sin(angle) * (radius - WALL_THICKNESS / 2),
      height,
      Math.cos(angle) * (radius - WALL_THICKNESS / 2),
    );
  }
}

/** A hollow, fully modeled silver crown, including the interior and rolled rim. */
export function createCrownModel() {
  const object = new Group();
  object.name = "silver-crown";
  const body = new Group();
  body.position.y = -.21;
  body.scale.y = .8;
  object.add(body);

  const silver = new MeshPhysicalMaterial({
    color: 0xe5e9ef,
    metalness: 1,
    roughness: .2,
    clearcoat: .32,
    clearcoatRoughness: .18,
    envMapIntensity: 1.25,
  });
  const innerSilver = new MeshPhysicalMaterial({
    color: 0x8c929d,
    metalness: 1,
    roughness: .28,
    envMapIntensity: .85,
  });
  const add = (name: string, geometry: BufferGeometry, material = silver) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    body.add(mesh);
    return mesh;
  };
  add("outer-shell", shellGeometry(false));
  add("inner-shell", shellGeometry(true), innerSilver);
  add("rounded-scalloped-edge", new TubeGeometry(new CrownEdge(), ANGULAR_SEGMENTS, .019, 8, true));

  // Closed lathe profile: the lower band has thickness and an open center.
  const band = [
    [.96, -.71], [1.01, -.71], [1.045, -.695], [1.065, -.67],
    [1.07, -.64], [1.06, -.60], [1.035, -.555], [1.015, -.52],
    [1.005, -.50], [.967, -.50], [.967, -.60], [.95, -.66],
    [.95, -.695], [.96, -.71],
  ].map(([radius, height]) => new Vector2(radius, height));
  add("rolled-base-band", new LatheGeometry(band, 160));
  const bead = add("base-bead", new TorusGeometry(1.015, .016, 10, 160));
  bead.rotation.x = Math.PI / 2;
  bead.position.y = -.52;

  const tipGeometry = new SphereGeometry(.084, 28, 20);
  for (let i = 0; i < CROWN_POINTS; i++) {
    const angle = i / CROWN_POINTS * TAU;
    const { height, radius } = crownProfile(angle);
    const tip = add(`rounded-tip-${i + 1}`, tipGeometry);
    tip.scale.y = 1 / body.scale.y; // Keep the finials spherical on the shorter band.
    tip.position.set(Math.sin(angle) * (radius - .017), height + .048, Math.cos(angle) * (radius - .017));
  }

  return {
    object,
    dispose() {
      const geometries = new Set<BufferGeometry>();
      body.traverse(child => { if (child instanceof Mesh) geometries.add(child.geometry); });
      geometries.forEach(geometry => geometry.dispose());
      silver.dispose();
      innerSilver.dispose();
    },
  };
}
