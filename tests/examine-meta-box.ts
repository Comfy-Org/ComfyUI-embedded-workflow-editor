import { readFile } from "fs/promises";

// Function to display a byte as a printable ASCII character
function toPrintableChar(byte: number): string {
  if (byte >= 32 && byte <= 126) {
    // Printable ASCII range
    return String.fromCharCode(byte);
  }
  return ".";
}

// Function to display bytes as hex and ASCII
function hexDump(buffer: Uint8Array, offset: number, length: number): void {
  const lines = Math.ceil(length / 16);

  for (let i = 0; i < lines; i++) {
    const lineOffset = offset + i * 16;
    const lineLength = Math.min(16, length - i * 16);
    const bytes = buffer.subarray(lineOffset, lineOffset + lineLength);

    // Hex display
    let hexPart = "";
    let asciiPart = "";

    for (let j = 0; j < lineLength; j++) {
      const byte = bytes[j];
      hexPart += byte.toString(16).padStart(2, "0") + " ";
      asciiPart += toPrintableChar(byte);
    }

    // Pad hex part for alignment
    hexPart = hexPart.padEnd(16 * 3, " ");

    console.log(
      `${lineOffset.toString(16).padStart(8, "0")}: ${hexPart} | ${asciiPart}`,
    );
  }
}

// Function to analyze the meta box in the MP4
async function examineMetaBox(filePath: string): Promise<void> {
  const buffer = await readFile(filePath);
  console.log(`File size: ${buffer.length} bytes`);

  // Find the 'moov' box
  let offset = 0;
  let moovOffset = 0;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;

    const size = buffer.readUInt32BE(offset);
    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7],
    );

    console.log(`Box at offset ${offset}: Type ${type}, Size ${size}`);

    if (type === "moov") {
      moovOffset = offset;
      break;
    }

    offset += size;
  }

  if (moovOffset === 0) {
    console.log("No moov box found");
    return;
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
      buffer[offset + 7],
    );

    console.log(`Inner box at offset ${offset}: Type ${type}, Size ${size}`);

    if (type === "udta") {
      udtaOffset = offset;
      break;
    }

    offset += size;
  }

  if (udtaOffset === 0) {
    console.log("No udta box found");
    return;
  }

  // Find and analyze the 'meta' box inside 'udta'
  let metaOffset = 0;
  offset = udtaOffset + 8; // Skip udta header
  const udtaSize = buffer.readUInt32BE(udtaOffset);
  const udtaEnd = udtaOffset + udtaSize;

  console.log(`\nAnalyzing udta box from ${offset} to ${udtaEnd}:`);

  while (offset < udtaEnd) {
    if (offset + 8 > udtaEnd) break;

    const size = buffer.readUInt32BE(offset);
    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7],
    );

    console.log(`Metadata box at offset ${offset}: Type ${type}, Size ${size}`);

    if (type === "meta") {
      metaOffset = offset;

      // Examine meta box in detail - first check version and flags (4 bytes)
      if (offset + 12 <= udtaEnd) {
        const version = buffer[offset + 8];
        const flags =
          (buffer[offset + 9] << 16) |
          (buffer[offset + 10] << 8) |
          buffer[offset + 11];
        console.log(
          `  Meta box version: ${version}, flags: 0x${flags.toString(16)}`,
        );

        // Meta box typically contains an 'hdlr' box followed by other boxes
        let innerOffset = offset + 12;
        const metaEnd = offset + size;

        console.log(
          `  Meta box internal structure from ${innerOffset} to ${metaEnd}:`,
        );
        while (innerOffset < metaEnd) {
          if (innerOffset + 8 > metaEnd) break;

          const innerSize = buffer.readUInt32BE(innerOffset);
          const innerType = String.fromCharCode(
            buffer[innerOffset + 4],
            buffer[innerOffset + 5],
            buffer[innerOffset + 6],
            buffer[innerOffset + 7],
          );

          console.log(
            `    Inner box at offset ${innerOffset}: Type ${innerType}, Size ${innerSize}`,
          );

          // Look for 'ilst' (item list) box which contains the actual metadata
          if (innerType === "ilst") {
            console.log(
              `    Found ilst box - analyzing items from ${innerOffset + 8} to ${innerOffset + innerSize}:`,
            );

            let itemOffset = innerOffset + 8;
            const ilstEnd = innerOffset + innerSize;

            while (itemOffset < ilstEnd) {
              if (itemOffset + 8 > ilstEnd) break;

              const itemSize = buffer.readUInt32BE(itemOffset);
              const itemName = String.fromCharCode(
                buffer[itemOffset + 4],
                buffer[itemOffset + 5],
                buffer[itemOffset + 6],
                buffer[itemOffset + 7],
              );

              console.log(
                `      Item at offset ${itemOffset}: Name ${itemName}, Size ${itemSize}`,
              );

              // Look for a 'data' box inside each item
              let dataOffset = itemOffset + 8;
              if (dataOffset + 8 <= itemOffset + itemSize) {
                const dataBoxSize = buffer.readUInt32BE(dataOffset);
                const dataBoxType = String.fromCharCode(
                  buffer[dataOffset + 4],
                  buffer[dataOffset + 5],
                  buffer[dataOffset + 6],
                  buffer[dataOffset + 7],
                );

                console.log(
                  `        Data box at offset ${dataOffset}: Type ${dataBoxType}, Size ${dataBoxSize}`,
                );

                // If this is 'data', look at the first 16 bytes of the data
                if (
                  dataBoxType === "data" &&
                  dataOffset + 16 <= itemOffset + itemSize
                ) {
                  console.log("        Data box header and start of content:");
                  hexDump(buffer, dataOffset, Math.min(64, dataBoxSize));

                  // Parse the data - first 8 bytes after 'data' are data type and locale
                  const dataType = buffer.readUInt32BE(dataOffset + 8);
                  const dataLocale = buffer.readUInt32BE(dataOffset + 12);
                  console.log(
                    `        Data type: ${dataType}, locale: ${dataLocale}`,
                  );

                  // The actual data starts at offset + 16
                  // For text data (type 1), try to interpret as UTF-8
                  if (dataType === 1) {
                    const dataStart = dataOffset + 16;
                    const dataLength = dataBoxSize - 16;
                    const textData = buffer.subarray(
                      dataStart,
                      dataStart + dataLength,
                    );
                    const text = new TextDecoder().decode(textData);
                    console.log(
                      `        Text data: ${text.length > 100 ? text.substring(0, 100) + "..." : text}`,
                    );

                    // Try to parse as JSON if it looks like JSON
                    if (
                      text.trim().startsWith("{") &&
                      text.trim().endsWith("}")
                    ) {
                      try {
                        const json = JSON.parse(text);
                        console.log("        Valid JSON detected");
                        // Check if this looks like our workflow data
                        if (json.nodes && json.links) {
                          console.log(
                            "        This appears to be workflow data!",
                          );
                          // If it looks like workflow data, dump the first part only
                          console.log(
                            `        Workflow excerpt: ${JSON.stringify(json).substring(0, 200)}...`,
                          );
                        }
                      } catch (e) {
                        console.log("        Not valid JSON data");
                      }
                    }
                  } else {
                    // For binary data, show a hex dump
                    console.log("        Binary data (first 64 bytes):");
                    hexDump(
                      buffer,
                      dataOffset + 16,
                      Math.min(64, dataBoxSize - 16),
                    );
                  }
                }
              }

              itemOffset += itemSize;
            }
          } else if (innerType === "keys") {
            // In iTunes-style metadata, keys box contains the names of custom metadata items
            console.log(`    Found keys box at offset ${innerOffset}:`);

            // Keys box starts with a version/flags (4 bytes) and entry count (4 bytes)
            if (innerOffset + 16 <= metaEnd) {
              const version = buffer[innerOffset + 8];
              const flags =
                (buffer[innerOffset + 9] << 16) |
                (buffer[innerOffset + 10] << 8) |
                buffer[innerOffset + 11];
              const entryCount = buffer.readUInt32BE(innerOffset + 12);

              console.log(
                `      Keys version: ${version}, flags: 0x${flags.toString(16)}, entry count: ${entryCount}`,
              );

              // Parse each key entry
              let keyOffset = innerOffset + 16;
              for (
                let i = 0;
                i < entryCount && keyOffset < innerOffset + innerSize;
                i++
              ) {
                if (keyOffset + 8 > innerOffset + innerSize) break;

                const keySize = buffer.readUInt32BE(keyOffset);
                const keyNamespace = String.fromCharCode(
                  buffer[keyOffset + 4],
                  buffer[keyOffset + 5],
                  buffer[keyOffset + 6],
                  buffer[keyOffset + 7],
                );

                // Key value follows (length is keySize - 8)
                const keyValueLength = keySize - 8;
                if (keyOffset + 8 + keyValueLength <= innerOffset + innerSize) {
                  const keyValue = buffer.subarray(
                    keyOffset + 8,
                    keyOffset + 8 + keyValueLength,
                  );
                  const keyName = new TextDecoder().decode(keyValue);

                  console.log(
                    `      Key ${i + 1}: Namespace ${keyNamespace}, Name ${keyName}`,
                  );
                }

                keyOffset += keySize;
              }
            }
          } else {
            // For other box types, just show a hex dump
            console.log(`    ${innerType} box content:`);
            hexDump(buffer, innerOffset + 8, Math.min(64, innerSize - 8));
          }

          innerOffset += innerSize;
        }
      }

      break;
    } else if (type === "wflo") {
      // This might be our custom workflow box
      console.log(
        `Found potential workflow box (wflo) at offset ${offset}, size ${size}`,
      );
      if (offset + 12 < udtaEnd) {
        const version = buffer[offset + 8];
        const flags =
          (buffer[offset + 9] << 16) |
          (buffer[offset + 10] << 8) |
          buffer[offset + 11];
        console.log(
          `  Workflow box version: ${version}, flags: 0x${flags.toString(16)}`,
        );

        // Data starts at offset + 12
        const dataOffset = offset + 12;
        const dataLength = size - 12;
        console.log(
          `  Workflow data from ${dataOffset} to ${dataOffset + dataLength}:`,
        );

        // Show first 100 bytes of hexdump
        hexDump(buffer, dataOffset, Math.min(100, dataLength));

        // Try to interpret as text
        try {
          const workflowData = new TextDecoder()
            .decode(buffer.subarray(dataOffset, dataOffset + dataLength))
            .trim();

          console.log(
            `  Workflow text data (first 200 chars): ${workflowData.substring(0, 200)}...`,
          );

          // Try to parse as JSON
          try {
            const json = JSON.parse(workflowData);
            console.log("  Valid JSON detected in workflow box");
            console.log(
              `  Workflow excerpt: ${JSON.stringify(json).substring(0, 200)}...`,
            );
          } catch (e) {
            console.log("  Not valid JSON data in workflow box");
          }
        } catch (e) {
          console.log("  Error decoding workflow data as text:", e);
        }
      }
    }

    offset += size;
  }

  if (metaOffset === 0) {
    console.log(
      "No meta box found, looking for other possible metadata containers",
    );

    // Search for 'wflo' box which might contain our workflow
    offset = udtaOffset + 8;
    while (offset < udtaEnd) {
      if (offset + 8 > udtaEnd) break;

      const size = buffer.readUInt32BE(offset);
      const type = String.fromCharCode(
        buffer[offset + 4],
        buffer[offset + 5],
        buffer[offset + 6],
        buffer[offset + 7],
      );

      console.log(`Box at offset ${offset}: Type ${type}, Size ${size}`);

      offset += size;
    }
  }
}

// Run the analysis
console.log("Starting analysis...");
examineMetaBox("./tests/mp4/img2vid_00009_.mp4").catch((error) =>
  console.error("Error analyzing MP4 meta box:", error),
);
