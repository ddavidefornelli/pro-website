import {
  ACESFilmicToneMapping, BackSide, BoxGeometry, Color, DirectionalLight,
  FrontSide, Mesh, MeshBasicMaterial, PerspectiveCamera, PMREMGenerator, Scene,
  SRGBColorSpace, WebGLRenderer,
} from "three";
import { createCrownModel } from "./crown-model";
import type { CrownFrame } from "./crown-motion";

/** Local studio softboxes give the chrome real reflections without an HDR download. */
function studioEnvironment() {
  const scene = new Scene();
  scene.background = new Color(0x343942);
  const geometry = new BoxGeometry(1, 1, 1);
  const materials: MeshBasicMaterial[] = [];
  const box = (color: number, intensity: number, position: number[], scale: number[], inside = false) => {
    const material = new MeshBasicMaterial({
      color: new Color(color).multiplyScalar(intensity),
      side: inside ? BackSide : FrontSide,
    });
    materials.push(material);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    scene.add(mesh);
  };
  box(0x343942, 1, [0, 0, 0], [12, 10, 12], true);
  box(0xffffff, 5, [-4, 1, 1], [.1, 6, 3]);
  box(0xe4ecff, 3, [4, 1, 0], [.1, 4, 3]);
  box(0xffffff, 4, [-1.5, 1.5, 5], [2, 4, .1]);
  box(0xffffff, 2, [2.5, .5, 5], [.6, 5, .1]);
  box(0xe3edff, 3, [1, 2, -4], [2, 3, .1]);
  box(0xffffff, 4, [0, 4, 0], [4, .1, 3]);
  return {
    scene,
    dispose() {
      geometry.dispose();
      materials.forEach(material => material.dispose());
    },
  };
}

export function createCrownRenderer(canvas: HTMLCanvasElement) {
  // Probe first, avoiding a thrown Three.js error on browsers without WebGL2.
  const context = canvas.getContext("webgl2", { alpha: true, antialias: true, powerPreference: "low-power" });
  if (!context) return undefined;
  const renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
  const crown = createCrownModel();
  const studio = studioEnvironment();
  const pmrem = new PMREMGenerator(renderer);
  let environment: ReturnType<PMREMGenerator["fromScene"]> | undefined;
  let studioReleased = false;
  const releaseStudio = () => {
    if (studioReleased) return;
    studioReleased = true;
    pmrem.dispose();
    studio.dispose();
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    crown.dispose();
    environment?.dispose();
    releaseStudio();
    renderer.dispose();
    if (!context.isContextLost()) renderer.forceContextLoss();
  };

  try {
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    environment = pmrem.fromScene(studio.scene, .04, .1, 30, { size: 128 });
    // Only the baked reflection texture is needed after this point.
    releaseStudio();

    const scene = new Scene();
    scene.environment = environment.texture;
    scene.add(crown.object);
    const key = new DirectionalLight(0xffffff, 3);
    key.position.set(-3, 4, 5);
    const rim = new DirectionalLight(0xc8dcff, 2);
    rim.position.set(4, 2, -3);
    scene.add(key, rim);

    const camera = new PerspectiveCamera(32, 1, .1, 20);
    camera.position.set(0, .04, 6.5);
    camera.lookAt(0, 0, 0);
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height || disposed) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75, 1200 / Math.max(width, height)));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    return {
      resize,
      render(frame: CrownFrame) {
        if (disposed) return;
        crown.object.rotation.set(frame.rotationX, frame.rotationY, frame.rotationZ);
        crown.object.position.y = frame.y;
        crown.object.scale.setScalar(frame.scale);
        renderer.render(scene, camera);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
