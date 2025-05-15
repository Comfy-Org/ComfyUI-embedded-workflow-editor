/**
 * Functions for handling metadata in MP4 files
 * @author GitHub Copilot
 */

/**
 * Get metadata from an MP4 file
 * Extracts all metadata fields including workflow JSON if present
 * 
 * 
 * @param input The MP4 file buffer as Uint8Array or ArrayBuffer
 * @returns Object containing extracted metadata with keys as field names and values as strings
 */
export function getMp4Metadata(
  input: Uint8Array | ArrayBuffer,
): Record<string, string> {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dataView = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const metadata: Record<string, string> = {};

  try {
    // Verify this is an MP4 file by checking for the 'ftyp' box at the beginning
    if (!hasFtypBox(dataView)) {
      throw new Error("Not a valid MP4 file");
    }

    // Parse the MP4 boxes to find metadata
    parseBoxes(dataView, 0, dataView.byteLength, metadata);
    return metadata;
  } catch (error) {
    console.error("Error extracting MP4 metadata:", error);
    return {};
  }
}

/**
 * Set metadata in an MP4 file
 * Injects or updates metadata in an MP4 file while preserving existing metadata fields
 * 
 * @param buffer The MP4 file buffer
 * @param metadata The metadata to set or update (existing fields with the same keys will be updated)
 * @returns The modified MP4 file buffer with updated metadata
 * @throws Error if the input is not a valid MP4 file
 */
export function setMp4Metadata(
  buffer: ArrayBuffer,
  metadata: Record<string, string>,
): Uint8Array {
  const inputData = new Uint8Array(buffer);
  const dataView = new DataView(buffer);

  try {
    // Verify this is an MP4 file
    if (!hasFtypBox(dataView)) {
      throw new Error("Not a valid MP4 file");
    }

    // Create a new buffer with the metadata
    return injectMetadata(inputData, dataView, metadata);
  } catch (error) {
    console.error("Error setting MP4 metadata:", error);
    throw error;
  }
}

/**
 * Check if the file has an 'ftyp' box at the beginning (required for MP4 files)
 * @param dataView DataView of the buffer to check
 * @returns boolean indicating if the 'ftyp' signature is present
 */
function hasFtypBox(dataView: DataView): boolean {
  // MP4 files start with a box that's at least 8 bytes
  if (dataView.byteLength < 8) {
    return false;
  }

  // Get the bytes at positions 4-7 which should be 'ftyp'
  const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset + 4, 4);

  // Convert to string and check
  const typeStr = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  return typeStr === 'ftyp';
}

/**
 * Parse MP4 boxes and extract metadata
 * MP4 files are organized in a hierarchical structure of 'boxes' (also called 'atoms')
 * Each box has a size (4 bytes) and type (4 bytes) followed by its content
 * 
 * @param dataView DataView of the MP4 buffer
 * @param start Starting offset in the buffer
 * @param end Ending offset in the buffer
 * @param metadata Object to populate with extracted metadata
 */
function parseBoxes(
  dataView: DataView,
  start: number,
  end: number,
  metadata: Record<string, string>,
) {
  let offset = start;

  while (offset < end) {
    // Check if we have enough data for a box header
    if (offset + 8 > end) {
      break;
    }

    // Read box size and type
    const size = dataView.getUint32(offset);
    const typeBytes = new Uint8Array(dataView.buffer, dataView.byteOffset + offset + 4, 4);
    const type = String.fromCharCode(typeBytes[0], typeBytes[1], typeBytes[2], typeBytes[3]);

    // Handle special case of large size (64-bit size field)
    let boxSize = size;
    let headerSize = 8;
    if (size === 1 && offset + 16 <= end) {
      // Read 64-bit size
      const lowBits = dataView.getUint32(offset + 12);
      // For simplicity, we'll only use the low bits, assuming high bits are 0
      // This works for files under 4GB
      boxSize = lowBits;
      headerSize = 16;
    }

    if (boxSize === 0) {
      // Box extends to the end of file
      boxSize = end - offset;
    }

    if (offset + boxSize > end) {
      // Box size extends beyond the buffer
      break;
    }

    // Process different box types
    if (type === "moov") {
      // 'moov' is a container box, recursively parse its contents
      parseBoxes(dataView, offset + headerSize, offset + boxSize, metadata);
    } else if (type === "udta") {
      // 'udta' is a user data box, usually inside 'moov'
      parseUserDataBox(dataView, offset + headerSize, offset + boxSize, metadata);
    } else if (type === 'meta') {
      // 'meta' box contains metadata
      // It has a 4-byte version/flags field after the header
      if (offset + headerSize + 4 <= end) {
        parseMetaBox(dataView, offset + headerSize + 4, offset + boxSize, metadata);
      }
    } else if (type === "uuid") {
      // Custom box with 16-byte UUID after the header
      if (offset + headerSize + 16 <= end) {
        parseUuidBox(dataView, offset + headerSize, offset + boxSize, metadata);
      }
    }

    // Move to the next box
    offset += boxSize;
  }
}

/**
 * Parse a 'udta' (user data) box for metadata
 * The 'udta' box can contain various types of user data including:
 * - Custom 'wflo' box with workflow data 
 * - Standard iTunes-style metadata atoms (e.g., '©nam')
 * - A 'meta' box with more structured metadata
 * 
 * @param dataView DataView of the MP4 buffer
 * @param start Starting offset of the udta box content
 * @param end Ending offset of the udta box 
 * @param metadata Object to populate with extracted metadata
 */
function parseUserDataBox(
  dataView: DataView,
  start: number,
  end: number,
  metadata: Record<string, string>,
) {
  let offset = start;

  while (offset < end) {
    if (offset + 8 > end) {
      break;
    }

    const size = dataView.getUint32(offset);
    const typeBytes = new Uint8Array(dataView.buffer, dataView.byteOffset + offset + 4, 4);
    const type = String.fromCharCode(typeBytes[0], typeBytes[1], typeBytes[2], typeBytes[3]);

    let boxSize = size;
    if (boxSize === 0) {
      boxSize = end - offset;
    }

    if (offset + boxSize > end) {
      break;
    }

    // Look for custom 'wflo' (workflow) box or standard metadata atoms like '©nam'
    if (type === "wflo" && offset + 12 < end) {
      // Extract workflow data (skip 8 bytes for header, 4 bytes for version/flags)
      try {
        const dataOffset = offset + 12;
        const dataLength = boxSize - 12;
        
        const workflowData = new Uint8Array(dataView.buffer, dataView.byteOffset + dataOffset, dataLength);
        metadata.workflow = new TextDecoder().decode(workflowData).trim();
      } catch (e) {
        console.error("Error parsing workflow data:", e);
      }
    } else if (type === "meta" && offset + 12 < end) {
      // Found a meta box inside udta - parse it
      // Meta box has 4-byte version/flags after header
      parseMetaBox(dataView, offset + 12, offset + boxSize, metadata);
    }

    // Handle other common metadata atoms
    if (type.startsWith("©") && offset + 12 < end) {
      // Handle standard iTunes metadata atoms
      try {
        const dataOffset = offset + 12; // Skip header and version/flags
        const dataLength = boxSize - 12;
        if (dataLength > 0) {
          const textData = new Uint8Array(dataView.buffer, dataView.byteOffset + dataOffset, dataLength);
          const key = type.substring(1); // Remove © prefix
          metadata[key] = new TextDecoder().decode(textData).trim();
        }
      } catch (e) {
        console.error(`Error parsing metadata atom ${type}:`, e);
      }
    }

    offset += boxSize;
  }
}

/**
 * Parse a 'meta' box for metadata
 * This function extracts metadata from iTunes-style metadata format which consists of:
 * - 'hdlr' box (handler, typically 'mdta')
 * - 'keys' box (defines metadata key names)
 * - 'ilst' box (contains the actual metadata values)
 * 
 * @param dataView DataView of the MP4 buffer
 * @param start Starting offset of the meta box content (after version/flags)
 * @param end Ending offset of the meta box
 * @param metadata Object to populate with extracted metadata
 */
function parseMetaBox(
  dataView: DataView,
  start: number,
  end: number,
  metadata: Record<string, string>,
) {
  let offset = start;
  let keysMap: Record<number, string> = {};
  let ilstOffset = 0;

  // Step 1: First scan to locate 'keys' and 'ilst' boxes
  while (offset < end) {
    if (offset + 8 > end) break;

    const size = dataView.getUint32(offset);
    const typeBytes = new Uint8Array(dataView.buffer, dataView.byteOffset + offset + 4, 4);
    const type = String.fromCharCode(typeBytes[0], typeBytes[1], typeBytes[2], typeBytes[3]);
    
    let boxSize = size;
    if (boxSize === 0) {
      boxSize = end - offset;
    }

    if (offset + boxSize > end) break;

    // Process the keys box to build a map of key indices to names
    if (type === 'keys') {
      try {
        // Keys box has: version/flags (4) + entry count (4) + key entries
        if (offset + 16 <= end) {
          const entryCount = dataView.getUint32(offset + 12);
          
          // Parse each key entry
          let keyOffset = offset + 16;
          for (let i = 0; i < entryCount; i++) {
            if (keyOffset + 8 > offset + boxSize) break;

            const keySize = dataView.getUint32(keyOffset);
            
            // Extract key name (string) - follows namespace (4)
            if (keySize > 8 && keyOffset + keySize <= offset + boxSize) {
              const keyValueBytes = new Uint8Array(
                dataView.buffer,
                dataView.byteOffset + keyOffset + 8,
                keySize - 8,
              );
              const keyName = new TextDecoder().decode(keyValueBytes).trim();
              
              // Store in our map (1-based index in file)
              keysMap[i + 1] = keyName;
            }

            keyOffset += keySize;
          }
        }
      } catch (e) {
        console.error("Error parsing keys box:", e);
      }
    } else if (type === 'ilst') {
      ilstOffset = offset;
    }

    offset += boxSize;
  }
  
  // Step 2: If we found both keys and ilst boxes, extract the values
  if (ilstOffset && Object.keys(keysMap).length > 0) {
    offset = ilstOffset + 8; // Skip ilst header
    const ilstSize = dataView.getUint32(ilstOffset);
    const ilstEnd = ilstOffset + ilstSize;
    
    // Items in ilst are indexed by position corresponding to key index
    let itemCount = 0;

    while (offset < ilstEnd) {
      if (offset + 8 > ilstEnd) break;

      const itemSize = dataView.getUint32(offset);
      itemCount++; // Count the items to map to key indices
      
      // Look for a 'data' box inside this item
      if (offset + 8 < offset + itemSize) {
        let dataOffset = offset + 8;
        const dataBoxSize = dataView.getUint32(dataOffset);
        const dataBoxTypeBytes = new Uint8Array(
          dataView.buffer,
          dataView.byteOffset + dataOffset + 4,
          4,
        );
        const dataBoxType = String.fromCharCode(
          dataBoxTypeBytes[0],
          dataBoxTypeBytes[1],
          dataBoxTypeBytes[2],
          dataBoxTypeBytes[3],
        );
        
        // Check if we have a valid 'data' box with correct format
        if (dataBoxType === 'data' && dataOffset + 16 <= offset + itemSize) {
          // Data box format: size (4) + 'data' (4) + dataType (4) + locale (4) + actual data
          const dataType = dataView.getUint32(dataOffset + 8);
          
          // For text data (type 1), extract it
          if (dataType === 1) {
            const actualDataOffset = dataOffset + 16;
            const actualDataSize = dataBoxSize - 16;

            if (actualDataOffset + actualDataSize <= offset + itemSize) {
              const textBytes = new Uint8Array(
                dataView.buffer,
                dataView.byteOffset + actualDataOffset,
                actualDataSize,
              );
              const textValue = new TextDecoder().decode(textBytes).trim();
              
              // Get the key name for this item and store the metadata
              const keyName = keysMap[itemCount];
              if (keyName) {
                metadata[keyName] = textValue;
              }
            }
          }
        }
      }

      offset += itemSize;
    }
  }
}

/**
 * Parse a 'uuid' box for metadata
 * A 'uuid' box can be used as a custom container for workflow data
 * It contains a 16-byte UUID followed by custom data
 * 
 * @param dataView DataView of the MP4 buffer
 * @param start Starting offset of the uuid box content (after header)
 * @param end Ending offset of the uuid box
 * @param metadata Object to populate with extracted metadata
 */
function parseUuidBox(
  dataView: DataView,
  start: number,
  end: number,
  metadata: Record<string, string>,
) {
  // Check for ComfyUI workflow UUID
  // Using a generic UUID for demonstration
  const WORKFLOW_UUID = [
    0x63,
    0x6f,
    0x6d,
    0x66, // 'comf'
    0x79,
    0x75,
    0x69,
    0x77, // 'yuiw'
    0x6f,
    0x72,
    0x6b,
    0x66, // 'orkf'
    0x6c,
    0x6f,
    0x77,
    0x00, // 'low\0'
  ];

  // Check if this UUID matches our custom UUID for workflows
  let isWorkflowUuid = true;
  for (let i = 0; i < 16; i++) {
    if (dataView.getUint8(start + i) !== WORKFLOW_UUID[i]) {
      isWorkflowUuid = false;
      break;
    }
  }

  if (isWorkflowUuid) {
    // This is our workflow UUID box, extract the data
    try {
      const dataOffset = start + 16; // Skip UUID
      const dataLength = end - dataOffset;
      if (dataLength > 0) {
        const workflowData = new Uint8Array(
          dataView.buffer,
          dataOffset,
          dataLength,
        );
        metadata.workflow = new TextDecoder().decode(workflowData).trim();
      }
    } catch (e) {
      console.error("Error parsing workflow data from UUID box:", e);
    }
  }
}

/**
 * Inject metadata into the MP4 file
 * This function locates the 'moov' box and adds/updates metadata within it
 * 
 * @param inputData The input MP4 file data
 * @param dataView DataView of the input MP4 buffer
 * @param newMetadata Metadata to add or update
 * @returns New MP4 file data with updated metadata
 * @throws Error if no 'moov' box is found
 */
function injectMetadata(
  inputData: Uint8Array,
  dataView: DataView,
  newMetadata: Record<string, string>,
): Uint8Array {
  // We'll use a strategy that involves:
  // 1. Locating the 'moov' box
  // 2. Finding or creating a 'udta' box within it
  // 3. Adding our custom 'wflo' box with the workflow data
  // 4. Reconstructing the file

  const moovInfo = findBox(dataView, 0, dataView.byteLength, "moov");
  if (!moovInfo) {
    throw new Error("No 'moov' box found in MP4 file");
  }

  // Build output with our modified moov box
  const parts: Uint8Array[] = [];

  // Add data before the moov box
  parts.push(inputData.slice(0, moovInfo.offset));

  // Add modified moov box
  const moovData = inputData.slice(
    moovInfo.offset,
    moovInfo.offset + moovInfo.size,
  );
  const modifiedMoov = injectMetadataIntoMoov(moovData, newMetadata);
  parts.push(modifiedMoov);

  // Add data after the moov box
  parts.push(inputData.slice(moovInfo.offset + moovInfo.size));

  // Combine all parts
  return concatenateUint8Arrays(parts);
}

/**
 * Find a box of the specified type in the MP4 file
 * @param dataView DataView of the MP4 buffer to search
 * @param start Starting offset for the search
 * @param end Ending offset for the search
 * @param targetType Four-character type of box to find (e.g., 'moov', 'udta')
 * @returns Object with offset and size of the found box, or null if not found
 */
function findBox(
  dataView: DataView,
  start: number,
  end: number,
  targetType: string,
): { offset: number; size: number } | null {
  let offset = start;

  while (offset < end) {
    if (offset + 8 > end) {
      break;
    }

    const size = dataView.getUint32(offset);
    const typeBytes = [
      dataView.getUint8(offset + 4),
      dataView.getUint8(offset + 5),
      dataView.getUint8(offset + 6),
      dataView.getUint8(offset + 7),
    ];
    const type = String.fromCharCode(...typeBytes);

    let boxSize = size;
    if (size === 1 && offset + 16 <= end) {
      // Large size (64-bit)
      boxSize = dataView.getUint32(offset + 12); // Using only low bits
    }

    if (boxSize === 0) {
      boxSize = end - offset;
    }

    if (offset + boxSize > end) {
      break;
    }

    if (type === targetType) {
      return { offset, size: boxSize };
    }

    offset += boxSize;
  }

  return null;
}

/**
 * Inject metadata into the moov box
 * This function modifies a moov box to include metadata by either:
 * 1. Updating an existing 'udta' box with new metadata while preserving existing metadata
 * 2. Creating a new 'udta' box if one doesn't exist
 * 
 * @param moovData The original moov box data
 * @param newMetadata The metadata to add or update
 * @returns The modified moov box data
 */
function injectMetadataIntoMoov(
  moovData: Uint8Array,
  newMetadata: Record<string, string>,
): Uint8Array {
  const dataView = new DataView(
    moovData.buffer,
    moovData.byteOffset,
    moovData.byteLength,
  );

  // Find the udta box if it exists
  const udtaInfo = findBox(dataView, 8, moovData.byteLength, "udta");

  // Extract existing metadata to preserve it
  const existingMetadata: Record<string, string> = {};

  if (udtaInfo) {
    // Extract existing metadata from the udta box
    const udtaData = moovData.slice(
      udtaInfo.offset,
      udtaInfo.offset + udtaInfo.size,
    );
    const udtaView = new DataView(
      udtaData.buffer,
      udtaData.byteOffset,
      udtaData.byteLength,
    );

    // Look for meta box in the udta box
    const metaInfo = findBox(udtaView, 8, udtaData.byteLength, "meta");
    if (metaInfo) {
      // Parse meta box to extract all metadata
      const metaData = udtaData.slice(
        metaInfo.offset,
        metaInfo.offset + metaInfo.size,
      );
      const metaView = new DataView(
        metaData.buffer,
        metaData.byteOffset,
        metaData.byteLength,
      );

      // Skip meta header (8) and version/flags (4)
      const metaOffset = 12;
      const metaEnd = metaData.byteLength;

      // Find the 'keys' box to map indices to key names
      let keysMap: Record<number, string> = {};
      let keysOffset = 0;
      let offset = metaOffset;

      while (offset < metaEnd) {
        if (offset + 8 > metaEnd) break;

        const size = metaView.getUint32(offset);
        const typeBytes = [
          metaView.getUint8(offset + 4),
          metaView.getUint8(offset + 5),
          metaView.getUint8(offset + 6),
          metaView.getUint8(offset + 7),
        ];
        const type = String.fromCharCode(...typeBytes);

        if (type === "keys" && offset + 16 <= metaEnd) {
          keysOffset = offset;
          const entryCount = metaView.getUint32(offset + 12);

          // Parse each key entry
          let keyOffset = offset + 16;
          for (let i = 0; i < entryCount; i++) {
            if (keyOffset + 8 > offset + size) break;

            const keySize = metaView.getUint32(keyOffset);

            // Extract key name (string)
            if (keySize > 8 && keyOffset + keySize <= offset + size) {
              const keyValueBytes = metaData.slice(
                keyOffset + 8,
                keyOffset + keySize,
              );
              const keyName = new TextDecoder().decode(keyValueBytes).trim();

              // Store in our map (1-based index in file)
              keysMap[i + 1] = keyName;
            }

            keyOffset += keySize;
          }
        }

        offset += size;
      }

      // If we found keys, look for the corresponding values in the 'ilst' box
      if (Object.keys(keysMap).length > 0) {
        offset = metaOffset;

        while (offset < metaEnd) {
          if (offset + 8 > metaEnd) break;

          const size = metaView.getUint32(offset);
          const typeBytes = [
            metaView.getUint8(offset + 4),
            metaView.getUint8(offset + 5),
            metaView.getUint8(offset + 6),
            metaView.getUint8(offset + 7),
          ];
          const type = String.fromCharCode(...typeBytes);

          if (type === "ilst") {
            // Parse the 'ilst' box which contains the actual metadata values
            let itemOffset = offset + 8;
            const ilstEnd = offset + size;
            let itemCount = 0;

            while (itemOffset < ilstEnd) {
              if (itemOffset + 8 > ilstEnd) break;

              const itemSize = metaView.getUint32(itemOffset);
              itemCount++;

              // Look for a 'data' box inside this item
              if (itemOffset + 8 < itemOffset + itemSize) {
                let dataOffset = itemOffset + 8;
                const dataBoxSize = metaView.getUint32(dataOffset);
                const dataBoxTypeBytes = [
                  metaView.getUint8(dataOffset + 4),
                  metaView.getUint8(dataOffset + 5),
                  metaView.getUint8(dataOffset + 6),
                  metaView.getUint8(dataOffset + 7),
                ];
                const dataBoxType = String.fromCharCode(...dataBoxTypeBytes);

                // Check if we have a valid 'data' box with text data
                if (
                  dataBoxType === "data" &&
                  dataOffset + 16 <= itemOffset + itemSize
                ) {
                  const dataType = metaView.getUint32(dataOffset + 8);

                  // For text data (type 1), extract it
                  if (dataType === 1) {
                    const actualDataOffset = dataOffset + 16;
                    const actualDataSize = dataBoxSize - 16;

                    if (
                      actualDataOffset + actualDataSize <=
                      itemOffset + itemSize
                    ) {
                      const textBytes = metaData.slice(
                        actualDataOffset,
                        actualDataOffset + actualDataSize,
                      );
                      const textValue = new TextDecoder()
                        .decode(textBytes)
                        .trim();

                      // Get the key name for this item
                      const keyName = keysMap[itemCount];
                      if (keyName) {
                        // Store the extracted metadata
                        existingMetadata[keyName] = textValue;
                      }
                    }
                  }
                }
              }

              itemOffset += itemSize;
            }
          }

          offset += size;
        }
      }
    }

    // Also check for custom 'wflo' box with workflow data
    let offset = 8; // Skip udta header
    while (offset < udtaData.byteLength) {
      if (offset + 8 > udtaData.byteLength) break;

      const size = udtaView.getUint32(offset);
      const typeBytes = [
        udtaView.getUint8(offset + 4),
        udtaView.getUint8(offset + 5),
        udtaView.getUint8(offset + 6),
        udtaView.getUint8(offset + 7),
      ];
      const type = String.fromCharCode(...typeBytes);

      if (type === "wflo" && offset + 12 < udtaData.byteLength) {
        // Extract workflow data
        const dataOffset = offset + 12;
        const dataLength = size - 12;

        if (dataOffset + dataLength <= udtaData.byteLength) {
          const workflowData = udtaData.slice(
            dataOffset,
            dataOffset + dataLength,
          );
          const workflowText = new TextDecoder().decode(workflowData).trim();

          if (!existingMetadata.workflow) {
            existingMetadata.workflow = workflowText;
          }
        }
      }

      offset += size;
    }

    // Modify existing udta box
    const beforeUdta = moovData.slice(0, udtaInfo.offset);
    const afterUdta = moovData.slice(udtaInfo.offset + udtaInfo.size);

    // Merge existing metadata with new metadata (new ones take precedence)
    const mergedMetadata = { ...existingMetadata };
    for (const key in newMetadata) {
      mergedMetadata[key] = newMetadata[key];
    }

    const modifiedUdta = createUdtaBox(mergedMetadata);

    // Update moov box size
    const newMoovSize =
      beforeUdta.length + modifiedUdta.length + afterUdta.length;
    const newMoovHeader = new Uint8Array(8);
    new DataView(newMoovHeader.buffer).setUint32(0, newMoovSize);
    newMoovHeader.set([0x6d, 0x6f, 0x6f, 0x76], 4); // 'moov'

    return concatenateUint8Arrays([
      newMoovHeader,
      beforeUdta.slice(8), // Skip original header
      modifiedUdta,
      afterUdta,
    ]);
  } else {
    // Create a new udta box and append it to moov
    const udtaBox = createUdtaBox(newMetadata);

    // Update moov box size
    const newMoovSize = moovData.byteLength + udtaBox.byteLength;
    const newMoovHeader = new Uint8Array(8);
    new DataView(newMoovHeader.buffer).setUint32(0, newMoovSize);
    newMoovHeader.set([0x6d, 0x6f, 0x6f, 0x76], 4); // 'moov'

    return concatenateUint8Arrays([
      newMoovHeader,
      moovData.slice(8), // Skip original header
      udtaBox,
    ]);
  }
}

/**
 * Create a udta box with the specified metadata
 * This function creates a properly formatted 'udta' box containing:
 * 1. A custom 'wflo' box for workflow data (if present)
 * 2. An iTunes-style metadata structure with 'meta', 'hdlr', 'keys', and 'ilst' boxes
 * 
 * @param metadata The metadata to include in the udta box
 * @returns A new Uint8Array containing the complete udta box
 */
function createUdtaBox(metadata: Record<string, string>): Uint8Array {
  // We need to create a properly formatted metadata box structure for iTunes-style metadata
  // This consists of:
  // 1. A 'meta' box with:
  //    - 'hdlr' box (handler, indicating it's metadata)
  //    - 'keys' box (defines metadata keys)
  //    - 'ilst' box (contains the actual metadata values)

  // First, create the parts for the workflow in 'wflo' format (legacy/custom format)
  const customParts: Uint8Array[] = [];

  // Add workflow in custom 'wflo' box format
  if (metadata.workflow) {
    const valueBytes = new TextEncoder().encode(metadata.workflow);
    const boxSize = 8 + 4 + valueBytes.byteLength;

    const boxHeader = new Uint8Array(12);
    const headerView = new DataView(boxHeader.buffer);
    headerView.setUint32(0, boxSize);
    boxHeader.set([0x77, 0x66, 0x6c, 0x6f], 4); // 'wflo'
    headerView.setUint32(8, 0); // Version and flags (0)

    customParts.push(boxHeader);
    customParts.push(valueBytes);
  }

  // Now create an iTunes-style metadata structure for all metadata
  // Only create it if there's more than just workflow, or if we want to use iTunes format for workflow too
  if (Object.keys(metadata).length > 0) {
    // Create hdlr box (required for meta box)
    const hdlrBox = new Uint8Array([
      0,
      0,
      0,
      33, // Size (33 bytes)
      0x68,
      0x64,
      0x6c,
      0x72, // 'hdlr'
      0,
      0,
      0,
      0, // Version and flags
      0,
      0,
      0,
      0, // Predefined
      0x6d,
      0x64,
      0x74,
      0x61, // Handler type: 'mdta'
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // Reserved
      0,
      0,
      0,
      0,
      0, // Name (empty string with terminator)
    ]);

    // Create keys box
    const keys: Uint8Array[] = [];
    const keyList = Object.keys(metadata);

    // Keys box header + version/flags + entry count
    const keysHeader = new Uint8Array(16);
    // Size will be set later
    keysHeader.set([0x6b, 0x65, 0x79, 0x73], 4); // 'keys'
    // Version and flags are all zeros
    new DataView(keysHeader.buffer).setUint32(12, keyList.length); // Entry count
    keys.push(keysHeader);

    // Add each key entry
    for (const key of keyList) {
      const keyBytes = new TextEncoder().encode(key);
      const keySize = 8 + keyBytes.byteLength; // Size (4) + namespace (4) + string
      const keyEntry = new Uint8Array(keySize);
      new DataView(keyEntry.buffer).setUint32(0, keySize);
      keyEntry.set([0x6d, 0x64, 0x74, 0x61], 4); // Namespace: 'mdta'
      keyEntry.set(keyBytes, 8);
      keys.push(keyEntry);
    }

    // Set keys box size
    const keysSize = keys.reduce((sum, part) => sum + part.length, 0);
    new DataView(keysHeader.buffer).setUint32(0, keysSize);

    // Create ilst box (contains the values)
    const ilst: Uint8Array[] = [];

    // ilst box header
    const ilstHeader = new Uint8Array(8);
    // Size will be set later
    ilstHeader.set([0x69, 0x6c, 0x73, 0x74], 4); // 'ilst'
    ilst.push(ilstHeader);

    // Add each metadata value
    for (let i = 0; i < keyList.length; i++) {
      const key = keyList[i];
      const value = metadata[key];
      const valueBytes = new TextEncoder().encode(value);

      // Item box = item header + data box
      // Data box = header (4+4) + type (4) + locale (4) + data
      const dataBoxSize = 16 + valueBytes.byteLength;
      const itemSize = 8 + dataBoxSize;

      // Item header - size (4) + index (4)
      const itemHeader = new Uint8Array(8);
      new DataView(itemHeader.buffer).setUint32(0, itemSize);
      // In iTunes style, the item ID corresponds to index in keys array + 1
      new DataView(itemHeader.buffer).setUint32(4, i + 1);

      // Data box header - size (4) + 'data' (4) + type (4) + locale (4)
      const dataHeader = new Uint8Array(16);
      new DataView(dataHeader.buffer).setUint32(0, dataBoxSize);
      dataHeader.set([0x64, 0x61, 0x74, 0x61], 4); // 'data'
      new DataView(dataHeader.buffer).setUint32(8, 1); // Type 1 = text (UTF-8)
      // Locale is 0

      // Add item to ilst
      ilst.push(itemHeader);
      ilst.push(dataHeader);
      ilst.push(valueBytes);
    }

    // Set ilst box size
    const ilstSize = ilst.reduce((sum, part) => sum + part.length, 0);
    new DataView(ilstHeader.buffer).setUint32(0, ilstSize);

    // Create meta box to contain hdlr, keys, and ilst
    const metaHeaderSize = 12; // 8 for header + 4 for version/flags
    const metaSize = metaHeaderSize + hdlrBox.byteLength + keysSize + ilstSize;
    const metaHeader = new Uint8Array(metaHeaderSize);
    new DataView(metaHeader.buffer).setUint32(0, metaSize);
    metaHeader.set([0x6d, 0x65, 0x74, 0x61], 4); // 'meta'
    // Version and flags are all zeros

    // Add meta box to parts
    customParts.push(metaHeader);
    customParts.push(hdlrBox);
    customParts.push(...keys);
    customParts.push(...ilst);
  }

  // Calculate udta box size
  const contentSize = customParts.reduce((sum, part) => sum + part.length, 0);
  const udtaSize = 8 + contentSize;

  // Create udta header
  const udtaHeader = new Uint8Array(8);
  new DataView(udtaHeader.buffer).setUint32(0, udtaSize);
  udtaHeader.set([0x75, 0x64, 0x74, 0x61], 4); // 'udta'

  // Combine all parts
  return concatenateUint8Arrays([udtaHeader, ...customParts]);
}

/**
 * Concatenate multiple Uint8Arrays into a single array
 * @param arrays Array of Uint8Arrays to concatenate
 * @returns A new Uint8Array containing all input arrays concatenated in sequence
 */
function concatenateUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  // Calculate the total length
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);

  // Create a new array with the total length
  const result = new Uint8Array(totalLength);

  // Copy each array into the result
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}
