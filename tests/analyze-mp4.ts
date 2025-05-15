import { readFile } from 'fs/promises';

// Function to display a byte as a printable ASCII character
function toPrintableChar(byte: number): string {
  if (byte >= 32 && byte <= 126) { // Printable ASCII range
    return String.fromCharCode(byte);
  }
  return '.';
}

// Function to display bytes as hex and ASCII
function hexDump(buffer: Uint8Array, offset: number, length: number): void {
  const lines = Math.ceil(length / 16);
  
  for (let i = 0; i < lines; i++) {
    const lineOffset = offset + i * 16;
    const lineLength = Math.min(16, length - i * 16);
    const bytes = buffer.subarray(lineOffset, lineOffset + lineLength);
    
    // Hex display
    let hexPart = '';
    let asciiPart = '';
    
    for (let j = 0; j < lineLength; j++) {
      const byte = bytes[j];
      hexPart += byte.toString(16).padStart(2, '0') + ' ';
      asciiPart += toPrintableChar(byte);
    }
    
    // Pad hex part for alignment
    hexPart = hexPart.padEnd(16 * 3, ' ');
    
    console.log(`${lineOffset.toString(16).padStart(8, '0')}: ${hexPart} | ${asciiPart}`);
  }
}

// Function to analyze MP4 box structure
async function analyzeMp4Structure(filePath: string): Promise<void> {
  const buffer = await readFile(filePath);
  console.log(`File size: ${buffer.length} bytes`);
  
  // Check file signature
  const fourBytes = buffer.subarray(4, 8);
  const signature = String.fromCharCode(...fourBytes);
  console.log(`File signature at offset 4: ${signature}`);
  
  if (signature !== 'ftyp') {
    console.log('Not a valid MP4 file - missing ftyp signature');
    return;
  }
  
  // Walk through the box structure
  let offset = 0;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      console.log('Not enough data for a box header');
      break;
    }
    
    const size = buffer.readUInt32BE(offset);
    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7]
    );
    
    console.log(`\nBox at offset ${offset}:`);
    console.log(`  Type: ${type}`);
    console.log(`  Size: ${size} bytes`);
    
    // Dump the first 64 bytes of the box
    console.log('  Hex dump of header and start of data:');
    hexDump(buffer, offset, Math.min(64, size));
    
    // If this is a 'moov' box, analyze its structure 
    if (type === 'moov') {
      console.log('  Analyzing moov box content:');
      let innerOffset = offset + 8;
      const moovEnd = offset + size;
      
      while (innerOffset < moovEnd) {
        if (innerOffset + 8 > moovEnd) {
          console.log('  Not enough data for an inner box header');
          break;
        }
        
        const innerSize = buffer.readUInt32BE(innerOffset);
        const innerType = String.fromCharCode(
          buffer[innerOffset + 4],
          buffer[innerOffset + 5],
          buffer[innerOffset + 6],
          buffer[innerOffset + 7]
        );
        
        console.log(`  Inner box at offset ${innerOffset}:`);
        console.log(`    Type: ${innerType}`);
        console.log(`    Size: ${innerSize} bytes`);
        
        // Look for the 'udta' box
        if (innerType === 'udta') {
          console.log('    Analyzing udta box content:');
          let udtaOffset = innerOffset + 8;
          const udtaEnd = innerOffset + innerSize;
          
          while (udtaOffset < udtaEnd) {
            if (udtaOffset + 8 > udtaEnd) {
              console.log('    Not enough data for a metadata atom header');
              break;
            }
            
            const atomSize = buffer.readUInt32BE(udtaOffset);
            const atomType = String.fromCharCode(
              buffer[udtaOffset + 4],
              buffer[udtaOffset + 5],
              buffer[udtaOffset + 6],
              buffer[udtaOffset + 7]
            );
            
            console.log(`    Metadata atom at offset ${udtaOffset}:`);
            console.log(`      Type: ${atomType}`);
            console.log(`      Size: ${atomSize} bytes`);
            
            udtaOffset += atomSize;
          }
        }
        
        innerOffset += innerSize;
      }
    }
    
    offset += size;
  }
}

// Run the analysis
analyzeMp4Structure('./tests/mp4/img2vid_00009_.mp4')
  .catch(error => console.error('Error analyzing MP4 structure:', error));
