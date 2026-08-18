const sharp = require('sharp');
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '../assets');
const sourceImage = path.join(assetsDir, 'gameCube.webp');

async function createICO() {
  // Convert WebP to PNG buffer first using sharp
  const pngBuffer = await sharp(sourceImage)
    .png()
    .toBuffer();
  
  // Load PNG into canvas
  const { createCanvas, loadImage } = require('canvas');
  const img = await loadImage(pngBuffer);
  
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  
  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Draw image centered, maintaining aspect ratio
    const scale = Math.min(size / img.width, size / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const x = (size - drawWidth) / 2;
    const y = (size - drawHeight) / 2;
    
    // White background for transparency
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    ctx.drawImage(img, x, y, drawWidth, drawHeight);
    
    pngBuffers.push(canvas.toBuffer('image/png'));
  }
  
  // Write ICO file format
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(sizes.length, 4);
  
  let offset = 6 + sizes.length * 16;
  const dirEntries = [];
  const imageData = [];
  
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const png = pngBuffers[i];
    
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    
    dirEntries.push(entry);
    imageData.push(png);
    offset += png.length;
  }
  
  const icoBuffer = Buffer.concat([icoHeader, ...dirEntries, ...imageData]);
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);
  console.log('Created icon.ico from gameCube.webp');
}

createICO().catch(console.error);