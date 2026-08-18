const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '../assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

function createIcon(filename, backgroundColor, emoji, isLive = false) {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  
  // Background circle
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fillStyle = backgroundColor;
  ctx.fill();
  
  // Border
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.strokeStyle = isLive ? '#e91e63' : '#f8bbd0';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  // Emoji
  ctx.font = '32px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 32, 36);
  
  // Live indicator
  if (isLive) {
    ctx.beginPath();
    ctx.arc(48, 16, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#e91e63';
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LIVE', 48, 16);
  }
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, filename), buffer);
  console.log(`Created ${filename}`);
}

try {
  createIcon('tray-icon.png', '#fff5f9', '🎮');
  createIcon('tray-icon-live.png', '#fff0f0', '🎮', true);
  createIcon('icon.png', '#fff5f9', '🎮');
  console.log('All icons created successfully!');
} catch (error) {
  console.error('Error creating icons:', error.message);
  console.log('You may need to install canvas: npm install canvas');
  console.log('Or manually create placeholder images in assets/ folder');
}