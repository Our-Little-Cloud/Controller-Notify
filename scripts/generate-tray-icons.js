const sharp = require('sharp');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '../assets');
const sourceImage = path.join(assetsDir, 'tray-image.png');

async function createTrayIcons() {
  // Convert WebP to PNG buffer first using sharp
  const pngBuffer = await sharp(sourceImage)
    .png()
    .toBuffer();
  
  // Load PNG into canvas
  const img = await loadImage(pngBuffer);
  
  // Offline tray icon (16x16 for tray) - preserve transparency
  const offlineCanvas = createCanvas(64, 64);
  const offCtx = offlineCanvas.getContext('2d');
  
  const scale = Math.min(64 / img.width, 64 / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const x = (64 - drawWidth) / 2;
  const y = (64 - drawHeight) / 2;
  offCtx.drawImage(img, x, y, drawWidth, drawHeight);
  
  fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), offlineCanvas.toBuffer('image/png'));
  console.log('Created tray-icon.png');

  // Live tray icon (with red LIVE badge) - preserve transparency
  const liveCanvas = createCanvas(64, 64);
  const liveCtx = liveCanvas.getContext('2d');
  
  liveCtx.drawImage(img, x, y, drawWidth, drawHeight);
  
  // Red circle badge
  liveCtx.beginPath();
  liveCtx.arc(48, 16, 12, 0, Math.PI * 2);
  liveCtx.fillStyle = '#e91e63';
  liveCtx.fill();
  liveCtx.strokeStyle = '#fff';
  liveCtx.lineWidth = 2;
  liveCtx.stroke();
  
  // LIVE text
  liveCtx.fillStyle = '#fff';
  liveCtx.font = 'bold 8px Arial';
  liveCtx.textAlign = 'center';
  liveCtx.textBaseline = 'middle';
  liveCtx.fillText('LIVE', 48, 16);
  
  fs.writeFileSync(path.join(assetsDir, 'tray-icon-live.png'), liveCanvas.toBuffer('image/png'));
  console.log('Created tray-icon-live.png');

  // App icon (256x256) - preserve transparency
  const iconCanvas = createCanvas(256, 256);
  const iconCtx = iconCanvas.getContext('2d');
  
  const iconScale = Math.min(256 / img.width, 256 / img.height);
  const iconDrawWidth = img.width * iconScale;
  const iconDrawHeight = img.height * iconScale;
  const iconX = (256 - iconDrawWidth) / 2;
  const iconY = (256 - iconDrawHeight) / 2;
  iconCtx.drawImage(img, iconX, iconY, iconDrawWidth, iconDrawHeight);
  
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), iconCanvas.toBuffer('image/png'));
  console.log('Created icon.png');
}

createTrayIcons().catch(console.error);