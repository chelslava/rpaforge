/**
 * RPAForge Demo GIF Capture Script
 *
 * Uses Playwright to capture screenshots of the Studio UI for generating
 * a demo GIF. Run after starting the dev server:
 *
 *   pnpm dev              # start Studio
 *   node scripts/capture-demo.js
 *
 * Requirements:
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * Output: docs/images/demo.gif (or individual frames in docs/images/frames/)
 *
 * Recommended post-processing:
 *   Use ScreenToGif (Windows), ffmpeg, or ImageMagick to stitch frames
 *   into an optimized GIF. Target: 1280×720, <5MB, 5–15 second loop.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FRAMES_DIR = path.resolve(__dirname, '..', 'docs', 'images', 'frames');
const STUDIO_URL = 'http://localhost:5173';

const SCENES = [
  {
    name: '01-empty-designer',
    description: 'Empty process designer canvas',
    action: async (page) => {
      // Wait for the designer to load
      await page.waitForSelector('[data-testid="react-flow"]', { timeout: 15000 });
    },
  },
  {
    name: '02-activity-palette',
    description: 'Activity palette with libraries',
    action: async (page) => {
      // Open activity palette
      const paletteBtn = page.locator('button', { hasText: 'Activities' });
      if (await paletteBtn.isVisible()) await paletteBtn.click();
      await page.waitForTimeout(1000);
    },
  },
  {
    name: '03-process-with-activities',
    description: 'Process with connected activities',
    action: async (page) => {
      // This relies on the app already having activities — in practice,
      // you should load a pre-built demo process file here.
      await page.waitForTimeout(500);
    },
  },
  {
    name: '04-execution-result',
    description: 'Process execution showing results',
    action: async (page) => {
      // Press Run button and capture execution state
      const runBtn = page.locator('button', { hasText: /Run|Execute/ });
      if (await runBtn.isVisible()) await runBtn.click();
      await page.waitForTimeout(2000);
    },
  },
];

async function capture() {
  // Ensure frames directory exists
  if (!fs.existsSync(FRAMES_DIR)) {
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  console.log(`Navigating to ${STUDIO_URL}...`);
  await page.goto(STUDIO_URL, { waitUntil: 'networkidle' });

  // Accept any dialogs
  page.on('dialog', (dialog) => dialog.dismiss());

  for (const scene of SCENES) {
    console.log(`📸 Capturing: ${scene.name} — ${scene.description}`);
    try {
      await scene.action(page);
      await page.screenshot({
        path: path.join(FRAMES_DIR, `${scene.name}.png`),
        fullPage: false,
      });
      console.log(`   ✓ Saved ${scene.name}.png`);
    } catch (err) {
      console.error(`   ✗ Failed: ${err.message}`);
    }
  }

  await browser.close();

  console.log('\n✅ All frames captured in:', FRAMES_DIR);
  console.log('\nTo create the GIF:');
  console.log('  Option 1 — ScreenToGif: Open frames, arrange, export as GIF');
  console.log('  Option 2 — ffmpeg:');
  console.log(
    '    ffmpeg -framerate 2 -i docs/images/frames/%02d-*.png -vf "fps=10,scale=1280:-1:flags=lanczos" docs/images/demo.gif'
  );
  console.log('  Option 3 — ImageMagick:');
  console.log(
    '    convert -delay 100 -loop 0 docs/images/frames/*.png docs/images/demo.gif'
  );
}

capture().catch(console.error);
