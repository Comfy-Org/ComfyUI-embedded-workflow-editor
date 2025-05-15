import { readFile, writeFile } from 'fs/promises';

/**
 * Extract workflow data from an MP4 file
 * @param filePath Path to the MP4 file
 * @returns Extracted workflow data as JSON, or null if not found
 */
async function extractWorkflowFromMp4(filePath: string): Promise<any> {
  const buffer = await readFile(filePath);
  console.log(`File size: ${buffer.length} bytes`);
  
  // Look for the 'moov' box
  let offset = 0;
  let moovOffset = 0;
  
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    
    const size = buffer.readUInt32BE(offset);
    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7]
    );
    
    console.log(`Box at offset ${offset}: Type ${type}, Size ${size}`);
    
    if (type === 'moov') {
      moovOffset = offset;
      break;
    }
    
    offset += size;
  }
  
  if (moovOffset === 0) {
    console.log('No moov box found');
    return null;
  }
  
  // Find the 'udta' box inside 'moov'
  let udtaOffset = 0;
  offset = moovOffset + 8; // Skip moov header
  const moovSize = buffer.readUInt32BE(moovOffset);
  const moovEnd = moovOffset + moovSize;
  
  while (offset < moovEnd) {
    if (offset + 8 > moovEnd) break;
    
    const size = buffer.readUInt32BE(offset);
    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7]
    );
    
    console.log(`Inner box at offset ${offset}: Type ${type}, Size ${size}`);
    
    if (type === 'udta') {
      udtaOffset = offset;
      break;
    }
    
    offset += size;
  }
  
  if (udtaOffset === 0) {
    console.log('No udta box found');
    return null;
  }
  
  // Find the 'meta' box inside 'udta'
  let metaOffset = 0;
  offset = udtaOffset + 8; // Skip udta header
  const udtaSize = buffer.readUInt32BE(udtaOffset);
  const udtaEnd = udtaOffset + udtaSize;
  
  while (offset < udtaEnd) {
    if (offset + 8 > udtaEnd) break;
    
    const size = buffer.readUInt32BE(offset);
    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7]
    );
    
    console.log(`Metadata box at offset ${offset}: Type ${type}, Size ${size}`);
    
    if (type === 'meta') {
      metaOffset = offset;
      break;
    }
    
    offset += size;
  }
  
  if (metaOffset === 0) {
    console.log('No meta box found');
    return null;
  }
  
  // Look for the keys and ilst boxes in the meta box
  let keysOffset = 0;
  let ilstOffset = 0;
  let workflowKeyIndex = -1;
  
  // Skip meta header and version/flags (12 bytes total)
  offset = metaOffset + 12;
  const metaSize = buffer.readUInt32BE(metaOffset);
  const metaEnd = metaOffset + metaSize;
  
  // First find the keys box to locate the "workflow" key
  while (offset < metaEnd) {
    if (offset + 8 > metaEnd) break;
    
    const size = buffer.readUInt32BE(offset);
    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7]
    );
    
    console.log(`Inner meta box at offset ${offset}: Type ${type}, Size ${size}`);
    
    if (type === 'keys') {
      keysOffset = offset;
      
      // Keys box starts with version/flags (4 bytes) and entry count (4 bytes)
      const entryCount = buffer.readUInt32BE(offset + 12);
      console.log(`Keys entry count: ${entryCount}`);
      
      // Find the "workflow" key
      let keyOffset = offset + 16;
      for (let i = 0; i < entryCount; i++) {
        const keySize = buffer.readUInt32BE(keyOffset);
        const keyNamespace = String.fromCharCode(
          buffer[keyOffset + 4],
          buffer[keyOffset + 5],
          buffer[keyOffset + 6],
          buffer[keyOffset + 7]
        );
        
        const keyValue = buffer.subarray(keyOffset + 8, keyOffset + keySize);
        const keyName = new TextDecoder().decode(keyValue).trim();
        
        console.log(`Key ${i+1}: ${keyName} (${keyNamespace})`);
        
        if (keyName === 'workflow') {
          workflowKeyIndex = i;
          console.log(`Found workflow key at index ${workflowKeyIndex + 1}`);
        }
        
        keyOffset += keySize;
      }
    } else if (type === 'ilst') {
      ilstOffset = offset;
    }
    
    offset += size;
  }
  
  if (workflowKeyIndex === -1 || ilstOffset === 0) {
    console.log('No workflow key or ilst box found');
    return null;
  }
  
  // Now extract the workflow data from the ilst box
  console.log(`Looking for item ${workflowKeyIndex + 1} in ilst box at offset ${ilstOffset}`);
  
  // Skip ilst header (8 bytes)
  offset = ilstOffset + 8;
  const ilstSize = buffer.readUInt32BE(ilstOffset);
  const ilstEnd = ilstOffset + ilstSize;
  
  // Skip to the correct item (they are 1-indexed in the file)
  let itemCount = 0;
  let workflowData = null;
  
  while (offset < ilstEnd) {
    if (offset + 8 > ilstEnd) break;
    
    const itemSize = buffer.readUInt32BE(offset);
    const itemIndex = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7]
    );
    
    console.log(`Item at offset ${offset}: Index ${itemIndex}, Size ${itemSize}`);
    itemCount++;
    
    // Check if this is the workflow item (5th item, index 4)
    if (itemCount === workflowKeyIndex + 1) {
      // Found the workflow item, look for the data box inside
      let dataOffset = offset + 8;
      if (dataOffset + 8 <= offset + itemSize) {
        const dataBoxSize = buffer.readUInt32BE(dataOffset);
        const dataBoxType = String.fromCharCode(
          buffer[dataOffset + 4],
          buffer[dataOffset + 5],
          buffer[dataOffset + 6],
          buffer[dataOffset + 7]
        );
        
        console.log(`Data box at offset ${dataOffset}: Type ${dataBoxType}, Size ${dataBoxSize}`);
        
        if (dataBoxType === 'data' && dataOffset + 16 <= offset + itemSize) {
          // Parse data type and locale
          const dataType = buffer.readUInt32BE(dataOffset + 8);
          const dataLocale = buffer.readUInt32BE(dataOffset + 12);
          console.log(`Data type: ${dataType}, locale: ${dataLocale}`);
          
          // For text data (type 1), extract as UTF-8
          if (dataType === 1) {
            const dataStart = dataOffset + 16;
            const dataLength = dataBoxSize - 16;
            const textData = buffer.subarray(dataStart, dataStart + dataLength);
            const text = new TextDecoder().decode(textData);
            
            console.log(`Extracted workflow text of length ${text.length}`);
            
            try {
              workflowData = JSON.parse(text);
              console.log('Successfully parsed workflow JSON');
            } catch (e) {
              console.error('Error parsing workflow JSON:', e);
              workflowData = text;
            }
            
            break;
          }
        }
      }
    }
    
    offset += itemSize;
  }
  
  return workflowData;
}

// Run the extraction
const filePath = process.argv[2] || './tests/mp4/img2vid_00009_.mp4';
const outputPath = process.argv[3] || './workflow-extracted.json';

console.log(`Extracting workflow from ${filePath}`);
console.log(`Will save to ${outputPath}`);

try {
  extractWorkflowFromMp4(filePath)
    .then(workflow => {
      if (workflow) {
        console.log('Workflow data extracted successfully');
        return writeFile(outputPath, JSON.stringify(workflow, null, 2));
      } else {
        console.log('No workflow data found');
      }
    })
    .then(() => {
      console.log(`Workflow saved to ${outputPath}`);
    })
    .catch(error => {
      console.error('Error during extraction:', error);
    });
} catch (error) {
  console.error('Error starting extraction:', error);
}
