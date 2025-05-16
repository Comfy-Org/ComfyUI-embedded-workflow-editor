/**
 * Functions for handling metadata in MP3 files through ID3 tags
 */

/**
 * Get metadata from an MP3 file
 * Extracts ID3 tags including workflow JSON if present
 *
 * @param input The MP3 file buffer as Uint8Array or ArrayBuffer
 * @returns Object containing extracted metadata with keys as field names and values as strings
 */
export function getMp3Metadata(
  input: Uint8Array | ArrayBuffer
): Record<string, string> {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dataView = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );
  const metadata: Record<string, string> = {};

  try {
    // Check for ID3v2 header
    if (isID3v2(dataView)) {
      parseID3v2(dataView, metadata);
    }

    // Check for ID3v1 tag at the end of the file
    if (hasID3v1(dataView)) {
      parseID3v1(dataView, metadata);
    }

    return metadata;
  } catch (error) {
    console.error("Error extracting MP3 metadata:", error);
    return {};
  }
}

/**
 * Set metadata in an MP3 file
 * Injects or updates ID3v2 tags in an MP3 file
 *
 * @param buffer The MP3 file buffer
 * @param metadata The metadata to set or update
 * @returns The modified MP3 file buffer with updated metadata
 */
export function setMp3Metadata(
  buffer: ArrayBuffer | SharedArrayBuffer | Uint8Array,
  metadata: Record<string, string>
): Uint8Array {
  // Convert to Uint8Array if not already
  const inputData =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // Create a DataView from the input data
  const dataView = new DataView(
    inputData.buffer,
    inputData.byteOffset,
    inputData.byteLength
  );

  try {
    // Create or update ID3v2 tags
    return updateID3v2Tags(inputData, dataView, metadata);
  } catch (error) {
    console.error("Error setting MP3 metadata:", error);
    throw error;
  }
}

/**
 * Check if the buffer has an ID3v2 header
 * @param dataView DataView of the buffer to check
 * @returns boolean indicating if ID3v2 header is present
 */
function isID3v2(dataView: DataView): boolean {
  if (dataView.byteLength < 10) {
    return false;
  }

  // ID3v2 starts with "ID3"
  const id3Header = String.fromCharCode(
    dataView.getUint8(0),
    dataView.getUint8(1),
    dataView.getUint8(2)
  );

  return id3Header === "ID3";
}

/**
 * Check if the buffer has an ID3v1 tag at the end
 * @param dataView DataView of the buffer to check
 * @returns boolean indicating if ID3v1 tag is present
 */
function hasID3v1(dataView: DataView): boolean {
  if (dataView.byteLength < 128) {
    return false;
  }

  // ID3v1 tag is 128 bytes at the end of the file, starting with "TAG"
  const offset = dataView.byteLength - 128;
  const tagMarker = String.fromCharCode(
    dataView.getUint8(offset),
    dataView.getUint8(offset + 1),
    dataView.getUint8(offset + 2)
  );

  return tagMarker === "TAG";
}

/**
 * Parse ID3v2 tags from the buffer
 * @param dataView DataView of the buffer
 * @param metadata Object to populate with extracted metadata
 */
function parseID3v2(
  dataView: DataView,
  metadata: Record<string, string>
): void {
  // Read ID3v2 header
  const version = dataView.getUint8(3);
  const revision = dataView.getUint8(4);
  const flags = dataView.getUint8(5);

  // Read tag size (28-bit synchsafe integer)
  const size = getSynchsafeInt(dataView, 6);

  let offset = 10; // Start after the header
  const endOffset = 10 + size;

  while (offset < endOffset && offset + 10 < dataView.byteLength) {
    // Frame ID is 4 characters in ID3v2.3 and ID3v2.4
    if (version >= 3) {
      const frameID = String.fromCharCode(
        dataView.getUint8(offset),
        dataView.getUint8(offset + 1),
        dataView.getUint8(offset + 2),
        dataView.getUint8(offset + 3)
      );

      // Frame size is 4 bytes
      let frameSize: number;
      if (version >= 4) {
        // ID3v2.4 uses synchsafe integers
        frameSize = getSynchsafeInt(dataView, offset + 4);
      } else {
        // ID3v2.3 uses regular integers
        frameSize = dataView.getUint32(offset + 4);
      }

      const frameFlags = dataView.getUint16(offset + 8);
      offset += 10; // Move past frame header

      // Special handling for custom TXXX frames that might contain our workflow
      if (frameID === "TXXX" && offset + frameSize <= endOffset) {
        const encoding = dataView.getUint8(offset);
        offset += 1;

        // Read description until null terminator
        let description = "";
        let i = 0;
        while (offset + i < endOffset) {
          const charCode = dataView.getUint8(offset + i);
          if (charCode === 0) break;
          description += String.fromCharCode(charCode);
          i++;
        }

        // Skip null terminator
        offset += i + 1;

        // Read value
        const valueLength = frameSize - (i + 2); // -1 for encoding byte, -1 for null terminator
        let value = "";

        // Simple ASCII/UTF-8 text extraction
        for (let j = 0; j < valueLength; j++) {
          if (offset + j < endOffset) {
            const charCode = dataView.getUint8(offset + j);
            if (charCode !== 0) {
              // Skip null bytes
              value += String.fromCharCode(charCode);
            }
          }
        }

        // Store in metadata - trim any remaining null characters
        metadata[description] = value.replace(/\0+$/g, '');

        offset += valueLength;
      }
      // Handle standard text frames (starting with "T")
      else if (
        frameID.startsWith("T") &&
        frameID !== "TXXX" &&
        offset + frameSize <= endOffset
      ) {
        const encoding = dataView.getUint8(offset);
        offset += 1;

        // Read text value (simple ASCII/UTF-8 extraction)
        let value = "";
        for (let i = 0; i < frameSize - 1; i++) {
          if (offset + i < endOffset) {
            const charCode = dataView.getUint8(offset + i);
            if (charCode !== 0) {
              // Skip null bytes
              value += String.fromCharCode(charCode);
            }
          }
        }

        // Map common frame IDs to friendly names
        const key = mapFrameIDToKey(frameID);
        metadata[key] = value.replace(/\0+$/g, '');

        offset += frameSize - 1;
      } else {
        // Skip other frame types
        offset += frameSize;
      }
    } else {
      // ID3v2.2 has 3-char frame IDs and 3-byte sizes
      const frameID = String.fromCharCode(
        dataView.getUint8(offset),
        dataView.getUint8(offset + 1),
        dataView.getUint8(offset + 2)
      );

      const frameSize =
        (dataView.getUint8(offset + 3) << 16) |
        (dataView.getUint8(offset + 4) << 8) |
        dataView.getUint8(offset + 5);

      offset += 6; // Move past frame header

      // Skip the frame content
      offset += frameSize;
    }
  }
}

/**
 * Parse ID3v1 tags from the buffer
 * @param dataView DataView of the buffer
 * @param metadata Object to populate with extracted metadata
 */
function parseID3v1(
  dataView: DataView,
  metadata: Record<string, string>
): void {
  const offset = dataView.byteLength - 128;

  // ID3v1 has fixed field sizes
  const title = readString(dataView, offset + 3, 30);
  const artist = readString(dataView, offset + 33, 30);
  const album = readString(dataView, offset + 63, 30);
  const year = readString(dataView, offset + 93, 4);

  if (title) metadata["title"] = title;
  if (artist) metadata["artist"] = artist;
  if (album) metadata["album"] = album;
  if (year) metadata["year"] = year;
}

/**
 * Update or create ID3v2 tags in the MP3 file
 * @param inputData Original MP3 file data
 * @param dataView DataView of the original buffer
 * @param metadata Metadata to update or add
 * @returns Updated MP3 buffer with new metadata
 */
function updateID3v2Tags(
  inputData: Uint8Array,
  dataView: DataView,
  metadata: Record<string, string>
): Uint8Array {
  // Create a new ID3v2.4 tag
  const id3Header = new Uint8Array([
    0x49,
    0x44,
    0x33, // "ID3"
    0x04,
    0x00, // Version 2.4.0
    0x00, // No flags
    0x00,
    0x00,
    0x00,
    0x00, // Size (to be filled in later)
  ]);

  // Create frames for each metadata item
  const frames: Uint8Array[] = [];

  Object.entries(metadata).forEach(([key, value]) => {
    // Use TXXX frame for workflow and custom fields
    if (key === "workflow" || !isStandardID3Field(key)) {
      frames.push(createTXXXFrame(key, value));
    } else {
      // Map to standard ID3 frame ID
      const frameId = mapKeyToFrameID(key);
      if (frameId) {
        frames.push(createTextFrame(frameId, value));
      }
    }
  });

  // Combine all frames
  const combinedFrames = concatUint8Arrays(frames);

  // Calculate total tag size and update the header
  const totalSize = combinedFrames.length;
  setSynchsafeInt(id3Header, 6, totalSize);

  // Determine where the audio data starts
  let audioDataStart = 0;
  if (isID3v2(dataView)) {
    // If there's an existing ID3v2 tag, skip it
    const existingSize = getSynchsafeInt(dataView, 6);
    audioDataStart = 10 + existingSize;
  }

  // Combine header, frames, and audio data
  const audioData = inputData.slice(audioDataStart);
  return concatUint8Arrays([id3Header, combinedFrames, audioData]);
}

/**
 * Create a TXXX frame for custom metadata
 * @param description Field description
 * @param value Field value
 * @returns Uint8Array containing the TXXX frame
 */
function createTXXXFrame(description: string, value: string): Uint8Array {
  // Frame header: "TXXX" + size (4 bytes) + flags (2 bytes)
  const frameHeader = new Uint8Array(10);
  const frameId = "TXXX";
  for (let i = 0; i < 4; i++) {
    frameHeader[i] = frameId.charCodeAt(i);
  }

  // Set encoding (UTF-8 = 0x03)
  const encoding = new Uint8Array([0x03]);

  // Convert description and value to UTF-8 bytes
  const descriptionBytes = new TextEncoder().encode(description);
  const nullByte = new Uint8Array([0x00]);
  const valueBytes = new TextEncoder().encode(value);

  // Calculate frame size (encoding + description + null + value)
  const frameSize =
    encoding.length +
    descriptionBytes.length +
    nullByte.length +
    valueBytes.length;

  // Set frame size (synchsafe integer for ID3v2.4)
  setSynchsafeInt(frameHeader, 4, frameSize);

  // Combine all parts
  return concatUint8Arrays([
    frameHeader,
    encoding,
    descriptionBytes,
    nullByte,
    valueBytes,
  ]);
}

/**
 * Create a standard text frame
 * @param frameId Frame ID (e.g., "TIT2" for title)
 * @param value Frame value
 * @returns Uint8Array containing the frame
 */
function createTextFrame(frameId: string, value: string): Uint8Array {
  // Frame header: frameId + size (4 bytes) + flags (2 bytes)
  const frameHeader = new Uint8Array(10);
  for (let i = 0; i < 4; i++) {
    frameHeader[i] = frameId.charCodeAt(i);
  }

  // Set encoding (UTF-8 = 0x03)
  const encoding = new Uint8Array([0x03]);

  // Convert value to UTF-8 bytes
  const valueBytes = new TextEncoder().encode(value);

  // Calculate frame size (encoding + value)
  const frameSize = encoding.length + valueBytes.length;

  // Set frame size (synchsafe integer for ID3v2.4)
  setSynchsafeInt(frameHeader, 4, frameSize);

  // Combine all parts
  return concatUint8Arrays([frameHeader, encoding, valueBytes]);
}

/**
 * Read a string of fixed length from the buffer
 * @param dataView DataView to read from
 * @param offset Start offset
 * @param length Length to read
 * @returns String trimmed of trailing nulls and spaces
 */
function readString(
  dataView: DataView,
  offset: number,
  length: number
): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    const char = dataView.getUint8(offset + i);
    if (char === 0) break; // Stop at null terminator
    result += String.fromCharCode(char);
  }
  return result.trim();
}

/**
 * Read a 28-bit synchsafe integer from the buffer
 * @param dataView DataView to read from
 * @param offset Start offset
 * @returns The integer value
 */
function getSynchsafeInt(dataView: DataView, offset: number): number {
  return (
    ((dataView.getUint8(offset) & 0x7f) << 21) |
    ((dataView.getUint8(offset + 1) & 0x7f) << 14) |
    ((dataView.getUint8(offset + 2) & 0x7f) << 7) |
    (dataView.getUint8(offset + 3) & 0x7f)
  );
}

/**
 * Write a 28-bit synchsafe integer to a buffer
 * @param buffer Buffer to write to
 * @param offset Offset to write at
 * @param value Value to write
 */
function setSynchsafeInt(
  buffer: Uint8Array,
  offset: number,
  value: number
): void {
  buffer[offset] = (value >> 21) & 0x7f;
  buffer[offset + 1] = (value >> 14) & 0x7f;
  buffer[offset + 2] = (value >> 7) & 0x7f;
  buffer[offset + 3] = value & 0x7f;
}

/**
 * Concatenate multiple Uint8Arrays
 * @param arrays Arrays to concatenate
 * @returns Combined array
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  // Calculate total length
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);

  // Create result array
  const result = new Uint8Array(totalLength);

  // Copy data
  let offset = 0;
  arrays.forEach((arr) => {
    result.set(arr, offset);
    offset += arr.length;
  });

  return result;
}

/**
 * Map ID3v2 frame IDs to friendly key names
 * @param frameId ID3v2 frame ID
 * @returns User-friendly key name
 */
function mapFrameIDToKey(frameId: string): string {
  const mapping: Record<string, string> = {
    TIT2: "title",
    TPE1: "artist",
    TALB: "album",
    TYER: "year",
    TDAT: "date",
    TCON: "genre",
    COMM: "comment",
    APIC: "cover",
    TXXX: "userDefined",
  };

  return mapping[frameId] || frameId;
}

/**
 * Map friendly key names to ID3v2 frame IDs
 * @param key User-friendly key name
 * @returns ID3v2 frame ID
 */
function mapKeyToFrameID(key: string): string | null {
  const mapping: Record<string, string> = {
    title: "TIT2",
    artist: "TPE1",
    album: "TALB",
    year: "TYER",
    date: "TDAT",
    genre: "TCON",
    comment: "COMM",
    cover: "APIC",
  };

  return mapping[key] || null;
}

/**
 * Check if a field name is a standard ID3 field
 * @param key Field name to check
 * @returns Boolean indicating if it's a standard field
 */
function isStandardID3Field(key: string): boolean {
  const standardFields = [
    "title",
    "artist",
    "album",
    "year",
    "date",
    "genre",
    "comment",
    "cover",
  ];

  return standardFields.includes(key.toLowerCase());
}
