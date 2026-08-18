const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '../assets');

function createICO() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  
  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff5f9';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#f8bbd0';
    ctx.lineWidth = Math.max(1, size / 32);
    ctx.stroke();
    
    const fontSize = Math.max(10, size * 0.5);
    ctx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎮', size/2, size/2 + fontSize * 0.1);
    
    pngBuffers.push(canvas.toBuffer('image/png'));
  }
  
  // Write ICO file format
  // ICO header: 6 bytes
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);      // Reserved (0)
  icoHeader.writeUInt16LE(1, 2);      // Type (1 = ICO)
  icoHeader.writeUInt16LE(sizes.length, 4); // Count
  
  // Directory entries: 16 bytes each
  let offset = 6 + sizes.length * 16;
  const dirEntries = [];
  const imageData = [];
  
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const png = pngBuffers[i];
    
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);  // Width (0 = 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1);  // Height (0 = 256)
    entry.writeUInt8(0, 2);     // Color count (0 = no palette)
    entry.writeUInt8(0, 3);     // Reserved
    entry.writeUInt16LE(1, 4);  // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(png.length, 8);  // Size of image data
    entry.writeUInt32LE(offset, 12);     // Offset of image data
    
    dirEntries.push(entry);
    imageData.push(png);
    offset += png.length;
  }
  
  const icoBuffer = Buffer.concat([icoHeader, ...dirEntries, ...imageData]);
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);
  console.log('Created proper icon.ico');
}

try {
  createICO();
} catch (error) {
  console.error('Error creating ICO:', error.message);
}