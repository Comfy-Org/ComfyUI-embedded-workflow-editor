export function getFlacMetadata(
  input: Uint8Array | ArrayBuffer,
): Record<string, string> {
  const buffer = new Uint8Array(input).buffer;
  const dataView = new DataView(buffer);

  // Verify the FLAC signature
  const signature = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (signature !== "fLaC") {
    throw new Error("Not a valid FLAC file");
  }

  // Parse metadata blocks
  let offset = 4;
  let vorbisComment = null;
  while (offset < dataView.byteLength) {
    const isLastBlock = dataView.getUint8(offset) & 0x80;
    const blockType = dataView.getUint8(offset) & 0x7f;
    const blockSize = dataView.getUint32(offset, false) & 0xffffff;
    offset += 4;

    if (blockType === 4) {
      // Vorbis Comment block type
      vorbisComment = parseVorbisComment(
        new DataView(buffer, offset, blockSize),
      );
    }

    offset += blockSize;
    if (isLastBlock) break;
  }

  return vorbisComment!;
}
export function getString(
  dataView: DataView,
  offset: number,
  length: number,
): string {
  let string = "";
  for (let i = 0; i < length; i++) {
    string += String.fromCharCode(dataView.getUint8(offset + i));
  }
  return string;
}
// Function to parse the Vorbis Comment block

export function parseVorbisComment(dataView: DataView): Record<string, string> {
  let offset = 0;
  const vendorLength = dataView.getUint32(offset, true);
  offset += 4;
  // const vendorString = getString(dataView, offset, vendorLength);
  offset += vendorLength;

  const userCommentListLength = dataView.getUint32(offset, true);
  offset += 4;
  const comments: Record<string, string> = {};
  for (let i = 0; i < userCommentListLength; i++) {
    const commentLength = dataView.getUint32(offset, true);
    offset += 4;
    const comment = getString(dataView, offset, commentLength);
    offset += commentLength;

    const ind = comment.indexOf("=");
    const key = comment.substring(0, ind);

    comments[key] = comment.substring(ind + 1);
  }

  return comments;
}

/**
 * Set metadata for a FLAC file
 * @param buffer The FLAC file buffer
 * @param metadata The metadata to set
 * @returns The modified FLAC file buffer
 */
export function setFlacMetadata(
  buffer: ArrayBuffer,
  metadata: Record<string, string>,
): Uint8Array {
  const inputData = new Uint8Array(buffer);
  const dataView = new DataView(inputData.buffer);

  // Verify the FLAC signature
  const signature = String.fromCharCode(...inputData.slice(0, 4));
  if (signature !== "fLaC") {
    throw new Error("Not a valid FLAC file");
  }

  // Create output buffer parts
  const outputParts: Uint8Array[] = [];

  // Add FLAC signature
  outputParts.push(inputData.slice(0, 4));

  // Parse metadata blocks
  let offset = 4;
  let vorbisCommentOffset = -1;
  let vorbisCommentSize = 0;
  let vorbisCommentBlockHeader = new Uint8Array(4);
  let lastMetadataBlockFound = false;

  // First pass: locate the VORBIS_COMMENT block and copy all other blocks
  while (offset < dataView.byteLength && !lastMetadataBlockFound) {
    const headerByte = dataView.getUint8(offset);
    const isLastBlock = (headerByte & 0x80) !== 0;
    const blockType = headerByte & 0x7f;
    const blockSize = dataView.getUint32(offset, false) & 0xffffff;
    const headerSize = 4;

    if (blockType === 4) {
      // Vorbis Comment block
      vorbisCommentOffset = offset;
      vorbisCommentSize = blockSize;
      vorbisCommentBlockHeader = inputData.slice(offset, offset + headerSize);
    } else {
      // Copy this metadata block (header + data) to output
      outputParts.push(
        inputData.slice(offset, offset + headerSize + blockSize),
      );
    }

    offset += headerSize + blockSize;
    if (isLastBlock) {
      lastMetadataBlockFound = true;
    }
  }

  // Extract existing vendor string from the vorbis comment block if it exists
  let vendorString = "ComfyUI Embedded Workflow Editor";
  let existingMetadata: Record<string, string> = {};

  if (vorbisCommentOffset !== -1) {
    try {
      const vorbisCommentData = new DataView(
        inputData.buffer,
        vorbisCommentOffset + 4,
        vorbisCommentSize,
      );
      const vendorLength = vorbisCommentData.getUint32(0, true);
      vendorString = getString(vorbisCommentData, 4, vendorLength);

      // Get existing metadata to preserve all keys
      existingMetadata = parseVorbisComment(vorbisCommentData);
      console.log("Existing metadata keys:", Object.keys(existingMetadata));
    } catch (err) {
      console.error("Error parsing existing Vorbis comment:", err);
    }
  }

  // Create a merged metadata object with existing values preserved
  const mergedMetadata: Record<string, string> = {};

  // First copy all existing metadata
  for (const [key, value] of Object.entries(existingMetadata)) {
    mergedMetadata[key] = value;
  }

  // Then add/override with new metadata
  for (const [key, value] of Object.entries(metadata)) {
    mergedMetadata[key] = value;
  }
  const newVorbisComment = createVorbisComment(vendorString, mergedMetadata); // Create the header for the Vorbis comment block
  // Make the Vorbis comment block the last metadata block
  let newVorbisHeader = new Uint8Array(4);

  // Set blockType = 4 (Vorbis comment) with isLast = true (0x80)
  newVorbisHeader[0] = 0x84; // 0x80 (isLast) | 0x04 (Vorbis Comment)

  // Set the block size (24-bit, big-endian)
  const blockSize = newVorbisComment.length;
  newVorbisHeader[1] = (blockSize >> 16) & 0xff;
  newVorbisHeader[2] = (blockSize >> 8) & 0xff;
  newVorbisHeader[3] = blockSize & 0xff;

  // Add the Vorbis comment block to the output
  outputParts.push(newVorbisHeader);
  outputParts.push(newVorbisComment);

  // Add the audio data (everything after metadata blocks)
  if (lastMetadataBlockFound && offset < inputData.length) {
    outputParts.push(inputData.slice(offset));
  }

  // Concatenate all parts into the final output buffer
  return concatenateUint8Arrays(outputParts);
}

/**
 * Create a Vorbis comment block from metadata
 * @param vendorString The vendor string
 * @param metadata The metadata key-value pairs
 * @returns The Vorbis comment block data
 */
function createVorbisComment(
  vendorString: string,
  metadata: Record<string, string>,
): Uint8Array {
  // Calculate the size of the Vorbis comment block
  const vendorBytes = new TextEncoder().encode(vendorString);
  const vendorLength = vendorBytes.length;

  // Convert metadata to comment strings (key=value)
  const comments: Uint8Array[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    const commentString = `${key}=${value}`;
    const commentBytes = new TextEncoder().encode(commentString);
    const commentLengthBuffer = new ArrayBuffer(4);
    new DataView(commentLengthBuffer).setUint32(0, commentBytes.length, true);

    comments.push(new Uint8Array(commentLengthBuffer));
    comments.push(commentBytes);
  }

  // Calculate total size
  const totalSize =
    4 + // vendor length
    vendorLength +
    4 + // comment count
    comments.reduce((acc, arr) => acc + arr.length, 0);

  // Create the Vorbis comment block
  const vorbisComment = new Uint8Array(totalSize);
  const dataView = new DataView(vorbisComment.buffer);

  // Write vendor length and vendor string
  dataView.setUint32(0, vendorLength, true);
  vorbisComment.set(vendorBytes, 4);

  // Write comment count
  const commentCount = Object.keys(metadata).length;
  dataView.setUint32(4 + vendorLength, commentCount, true);

  // Write comments
  let offset = 4 + vendorLength + 4;
  for (const comment of comments) {
    vorbisComment.set(comment, offset);
    offset += comment.length;
  }

  return vorbisComment;
}

/**
 * Concatenate multiple Uint8Arrays into a single array
 * @param arrays The arrays to concatenate
 * @returns The concatenated array
 */
function concatenateUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  // Calculate the total length
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);

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
