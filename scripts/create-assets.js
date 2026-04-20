/**
 * Generates placeholder app icons and splash screen.
 * Run: node scripts/create-assets.js
 * Replace the generated images with your actual branding before shipping.
 */

const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

// Only generate if files don't exist
const files = {
  'icon.png': { width: 1024, height: 1024, bg: 0x6366F1ff },
  'adaptive-icon.png': { width: 1024, height: 1024, bg: 0x6366F1ff },
  'splash.png': { width: 1284, height: 2778, bg: 0x0F1117ff },
};

const missing = Object.keys(files).filter(f => !fs.existsSync(path.join(assetsDir, f)));

if (missing.length === 0) {
  console.log('✓ All assets already exist.');
  process.exit(0);
}

console.log(`Creating ${missing.length} placeholder asset(s)...`);

let jimp;
try {
  jimp = require('jimp');
} catch {
  console.error('jimp not found. Run: npm install --save-dev jimp');
  process.exit(1);
}

async function run() {
  for (const filename of missing) {
    const { width, height, bg } = files[filename];
    const img = new jimp.Jimp({ width, height, color: bg });
    const dest = path.join(assetsDir, filename);
    await img.write(dest);
    console.log(`  ✓ Created ${filename} (${width}x${height})`);
  }
  console.log('\nReplace these with your actual app icons before publishing!');
}

run().catch(err => {
  console.error('Failed to create assets:', err.message);
  process.exit(1);
});
