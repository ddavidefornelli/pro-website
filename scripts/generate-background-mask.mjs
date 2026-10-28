// Bake luminance into PNG alpha so Safari does not need CSS mask-mode support.
// Run with: node scripts/generate-background-mask.mjs
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const source = await readFile(new URL("../public/prune-background.png", import.meta.url));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const png = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const luminance = Math.round(0.2125 * pixels.data[i] + 0.7154 * pixels.data[i + 1] + 0.0721 * pixels.data[i + 2]);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = luminance;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, source.toString("base64"));
  await writeFile(new URL("../public/prune-background-mask.png", import.meta.url), Buffer.from(png, "base64"));
} finally {
  await browser.close();
}
