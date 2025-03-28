import { crc32FromArrayBuffer } from "crc32-from-arraybuffer";
import { concatUint8Arrays } from "uint8array-extras";

// Add these constants at the top of the file
const EXIF_TAGS = {
  UserComment: 0x9286,
  WorkflowTag: 0x8298  // Using ImageDescription tag for workflow
};

export function getPngMetadata(buffer: ArrayBuffer): Record<string, string> {
  // Get the PNG data as a Uint8Array
  const pngData = new Uint8Array(buffer);
  const dataView = new DataView(pngData.buffer);

  // Check that the PNG signature is present
  if (dataView.getUint32(0) !== 0x89504e47) {
    console.error("Not a valid PNG file");
    throw new Error("no buffer");
  }

  // Start searching for chunks after the PNG signature
  let offset = 8;
  const txt_chunks: Record<string, string> = {};
  // Loop through the chunks in the PNG file
  while (offset < pngData.length) {
    // Get the length of the chunk
    const length = dataView.getUint32(offset);
    // Get the chunk type
    const type = String.fromCharCode(...pngData.slice(offset + 4, offset + 8));
    if (type === "tEXt" || type == "comf" || type === "iTXt") {
      // Get the keyword
      let keyword_end = offset + 8;
      while (pngData[keyword_end] !== 0) {
        keyword_end++;
      }
      const keyword = String.fromCharCode(
        ...pngData.slice(offset + 8, keyword_end)
      );
      // Get the text
      const contentArraySegment = pngData.slice(
        keyword_end + 1,
        offset + 8 + length
      );
      const contentJson = new TextDecoder("utf-8").decode(contentArraySegment);

      if (txt_chunks[keyword])
        console.warn(`Duplicated keyword ${keyword} has been overwritten`);
      txt_chunks[keyword] = contentJson;
    }

    offset += 12 + length;
  }
  return txt_chunks;
}

export async function setPngFileMetadata(
  file: File,
  new_txt_chunks: Record<string, string>,
  newFilename?: string
): Promise<File> {
  const buffer = await file.arrayBuffer();
  const newBuffer = setPngMetadata(buffer, new_txt_chunks);
  return new File([newBuffer], newFilename ?? file.name, { type: file.type });
}

/*
ref: png chunk struct:
{
  uint32 length;
  char type[4];
  char data[length] {
    keyword\0
    content\0
  }
  uint32 crc;
}

- [JavascriptでPNGファイルにtEXtチャンクを差し込むサンプルコード - ホンモノのエンジニアになりたい]( https://www.engineer-log.com/entry/2019/12/24/insert-textchunk )
*/
export function setPngMetadata(
  buffer: ArrayBuffer,
  new_txt_chunks: Record<string, string>
): Uint8Array {
  // Get the PNG data as a Uint8Array
  const pngData = new Uint8Array(buffer);
  const newPngChunks: Uint8Array[] = [];
  const dataView = new DataView(pngData.buffer);

  // Check that the PNG signature is present
  if (dataView.getUint32(0) !== 0x89504e47)
    throw new Error("Not a valid PNG file");
  newPngChunks.push(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );

  // Start searching for chunks after the PNG signature
  let offset = 8;
  const txt_chunks: Record<string, string> = {};
  // Loop through the chunks in the PNG file
  while (offset < pngData.length) {
    // Get the length of the chunk
    const length = dataView.getUint32(offset);
    // Get the chunk type
    const type = String.fromCharCode(...pngData.slice(offset + 4, offset + 8));
    if (type === "tEXt" || type == "comf" || type === "iTXt") {
      // Get the keyword
      let keyword_end = offset + 8;
      while (pngData[keyword_end] !== 0) keyword_end++;
      const keyword = String.fromCharCode(
        ...pngData.slice(offset + 8, keyword_end)
      );
      const crc32 = dataView.getUint32(offset + 8 + length);
      // compare crc32
      if (new_txt_chunks[keyword] == null && txt_chunks[keyword] != null) {
        new_txt_chunks[keyword] = txt_chunks[keyword];
      }
      if (new_txt_chunks[keyword] != null) {
        // Get the text
        const contentArraySegment = pngData.slice(
          keyword_end + 1,
          offset + 8 + length
        );
        // load old content
        const contentJson = new TextDecoder("utf-8").decode(
          contentArraySegment
        );
        txt_chunks[keyword] = contentJson;

        // compare and encode new content
        if (new_txt_chunks[keyword] === contentJson) {
          console.warn("warn: nothing changed while set metadata to png");
        }

        const contentLength = new_txt_chunks[keyword].length ?? 0;
        if (contentLength > 0) {
          // const encodedKeyword = new TextEncoder().encode(keyword + "\x00");
          // const encodedContent = new TextEncoder().encode(
          //   new_txt_chunks[keyword] + "\x00"
          // );
          const encoded = new TextEncoder().encode(
            keyword + "\x00" + new_txt_chunks[keyword]
          );

          const chunkLength = encoded.length;
          const chunkType = pngData.slice(offset + 4, offset + 8);

          // calculate crc32
          const crcTarget = new Uint8Array(
            chunkType.length + 4 + encoded.length
          );
          crcTarget.set(chunkType, 0);
          crcTarget.set(new Uint8Array(chunkLength), chunkType.length);
          const chunkCRC32 = crc32FromArrayBuffer(crcTarget);
          if (new_txt_chunks[keyword] === contentJson && crc32 !== chunkCRC32) {
            console.warn(
              "warn: crc32 is not matched while content is not changed"
            );
          }
          // console.warn("keyword", keyword);
          // console.warn("content: ", contentJson);
          // console.warn("crc32: ", crc32);
          // console.warn("crc32(new): ", chunkCRC32);
          // console.warn("length: ", length);
          // console.warn("newLength: ", chunkLength);

          const newPngChunk = new Uint8Array(8 + chunkLength + 4);
          const dataView = new DataView(newPngChunk.buffer);
          dataView.setUint32(0, chunkLength);
          newPngChunk.set(chunkType, 4);
          newPngChunk.set(encoded, 8);
          dataView.setUint32(8 + chunkLength, chunkCRC32);
          newPngChunks.push(newPngChunk);
          delete new_txt_chunks[keyword]; //mark used
        }
      } else {
        // if this keyword is not in new_txt_chunks,
        // keep the old content
        newPngChunks.push(pngData.slice(offset, offset + 8 + length + 4));
      }
    } else {
      // Copy the chunk to the new PNG data
      newPngChunks.push(pngData.slice(offset, offset + 8 + length + 4));
    }

    offset += 12 + length;
  }

  // If no EXIF section was found, add new metadata chunks
  Object.entries(new_txt_chunks).map(([keyword, content]) => {
    // console.log(`Adding exif section for ${keyword}`);
    const encoded = new TextEncoder().encode(keyword + "\x00" + content);
    const chunkLength = encoded.length;
    const chunkType = new TextEncoder().encode("tEXt");

    // Calculate crc32
    const crcTarget = new Uint8Array(chunkType.length + encoded.length);
    crcTarget.set(chunkType, 0);
    crcTarget.set(encoded, chunkType.length);
    const chunkCRC32 = crc32FromArrayBuffer(crcTarget);

    const newPngChunk = new Uint8Array(8 + chunkLength + 4);
    const dataView = new DataView(newPngChunk.buffer);
    dataView.setUint32(0, chunkLength);
    newPngChunk.set(chunkType, 4);
    newPngChunk.set(encoded, 8);
    dataView.setUint32(8 + chunkLength, chunkCRC32);
    newPngChunks.push(newPngChunk);
  });

  const newPngData = concatUint8Arrays(newPngChunks);
  return newPngData;
}

export function removeExt(f: string) {
  if (!f) return f;
  const p = f.lastIndexOf(".");
  if (p === -1) return f;
  return f.substring(0, p);
}

// @ts-strict-ignore
export function getFlacMetadata(buffer: ArrayBuffer): Record<string, string> {
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
        new DataView(buffer, offset, blockSize)
      );
    }

    offset += blockSize;
    if (isLastBlock) break;
  }

  return vorbisComment!;
}

// Function to parse the Vorbis Comment block
function parseVorbisComment(dataView: DataView): Record<string, string> {
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

function getString(dataView: DataView, offset: number, length: number): string {
  let string = "";
  for (let i = 0; i < length; i++) {
    string += String.fromCharCode(dataView.getUint8(offset + i));
  }
  return string;
}

export function getWebpMetadata(buffer: ArrayBuffer): Record<string, string> {
  const webp = new Uint8Array(buffer);
  const dataView = new DataView(webp.buffer);

  // Check that the WEBP signature is present
  if (
    dataView.getUint32(0) !== 0x52494646 ||
    dataView.getUint32(8) !== 0x57454250
  ) {
    console.error("Not a valid WEBP file");
    return {};
  }

  // Start searching for chunks after the WEBP signature
  let offset = 12;
  const txt_chunks: Record<string, string> = {};
  
  // Loop through the chunks in the WEBP file
  while (offset < webp.length) {
    const chunk_length = dataView.getUint32(offset + 4, true);
    const chunk_type = String.fromCharCode(...webp.slice(offset, offset + 4));
    
    if (chunk_type === "EXIF") {
      let exifOffset = offset + 8;
      
      // Check for and skip Exif\0\0 header if present
      if (String.fromCharCode(...webp.slice(exifOffset, exifOffset + 6)) === "Exif\0\0") {
        exifOffset += 6;
      }
      
      const exifData = webp.slice(exifOffset, offset + 8 + chunk_length);
      const data = decodeWebpExifData(exifData);
      
      // Look specifically for our workflow tag
      if (data[EXIF_TAGS.WorkflowTag]) {
        const value = data[EXIF_TAGS.WorkflowTag];
        const index = value.indexOf(":");
        if (index !== -1) {
          txt_chunks[value.slice(0, index)] = value.slice(index + 1);
        }
      }
      break;
    }
    
    offset += 8 + chunk_length + (chunk_length % 2); // Include padding
  }
  
  return txt_chunks;
}

export async function setWebpFileMetadata(
  file: File,
  new_txt_chunks: Record<string, string>,
  newFilename?: string
): Promise<File> {
  const buffer = await file.arrayBuffer();
  const newBuffer = setWebpMetadata(buffer, new_txt_chunks);
  return new File([newBuffer], newFilename ?? file.name);
}
/**
 * - [WebP の構造を追ってみる 🏗 \| Basicinc Enjoy Hacking!]( https://tech.basicinc.jp/articles/177 )
 * WIP
 */
export function setWebpMetadata(
  buffer: ArrayBuffer,
  modifyRecords: Record<string, string>
): Uint8Array {
  const webp = new Uint8Array(buffer);
  const newChunks: Uint8Array[] = [];
  const dataView = new DataView(webp.buffer);

  // Validate WebP header
  if (dataView.getUint32(0) !== 0x52494646 || dataView.getUint32(8) !== 0x57454250) {
    throw new Error("Not a valid WEBP file");
  }

  // Copy header
  newChunks.push(webp.slice(0, 12));

  let offset = 12;
  let exifChunkFound = false;

  while (offset < webp.length) {
    const chunk_type = String.fromCharCode(...webp.slice(offset, offset + 4));
    const chunk_length = dataView.getUint32(offset + 4, true);
    const paddedLength = chunk_length + (chunk_length % 2);

    if (chunk_type === "EXIF") {
      exifChunkFound = true;
      // Skip this chunk as we'll create a new one
    } else {
      newChunks.push(webp.slice(offset, offset + 8 + paddedLength));
    }

    offset += 8 + paddedLength;
  }

  // Create new EXIF chunk if we have data to write
  if (Object.keys(modifyRecords).length > 0) {
    const exifHeader = new TextEncoder().encode("Exif\0\0");
    const tiffHeader = new Uint8Array([
      0x49, 0x49,  // Little-endian
      0x2A, 0x00,  // TIFF magic
      0x08, 0x00, 0x00, 0x00  // IFD offset
    ]);

    // Create IFD entries
    const entries = [];
    if (modifyRecords.workflow) {
      // Format the workflow data with the key:value format
      const workflowData = `workflow:${modifyRecords.workflow}`;
      const workflowValue = new TextEncoder().encode(workflowData + '\0');
      entries.push({
        tag: EXIF_TAGS.WorkflowTag,
        type: 2,  // ASCII
        count: workflowValue.length,
        value: workflowValue
      });
    }

    // Calculate sizes and offsets
    const ifdSize = 2 + (entries.length * 12) + 4;  // count + entries + next IFD offset
    const valueOffset = tiffHeader.length + ifdSize;
    
    // Create IFD
    const ifd = new Uint8Array(ifdSize);
    const ifdView = new DataView(ifd.buffer);
    ifdView.setUint16(0, entries.length, true);  // Number of entries

    // Write entries and collect values
    let currentValueOffset = valueOffset;
    const values: Uint8Array[] = [];
    
    entries.forEach((entry, i) => {
      const entryOffset = 2 + (i * 12);
      ifdView.setUint16(entryOffset, entry.tag, true);
      ifdView.setUint16(entryOffset + 2, entry.type, true);
      ifdView.setUint32(entryOffset + 4, entry.count, true);
      ifdView.setUint32(entryOffset + 8, currentValueOffset, true);
      
      values.push(entry.value);
      currentValueOffset += entry.value.length;
    });

    // Combine all parts
    const exifContent = concatUint8Arrays([
      exifHeader,
      tiffHeader,
      ifd,
      ...values
    ]);

    // Create EXIF chunk header
    const chunkHeader = new Uint8Array(8);
    const headerView = new DataView(chunkHeader.buffer);
    headerView.setUint32(0, 0x45584946);  // "EXIF"
    headerView.setUint32(4, exifContent.length, true);

    // Add padding if needed
    const padding = exifContent.length % 2 ? new Uint8Array([0]) : new Uint8Array(0);

    // Add the new EXIF chunk
    newChunks.push(chunkHeader, exifContent, padding);
  }

  // Combine all chunks
  const newWebpData = concatUint8Arrays(newChunks);

  // Update RIFF size
  const riffSizeView = new DataView(newWebpData.buffer, 4, 4);
  riffSizeView.setUint32(0, newWebpData.length - 8, true);

  return newWebpData;
}

function decodeWebpExifData(exifData: Uint8Array): Record<number, string> {
  const isLittleEndian = String.fromCharCode(...exifData.slice(0, 2)) === "II";
  
  function readInt(offset: number, length: number): number {
    try {
      const view = new DataView(exifData.buffer, exifData.byteOffset + offset, length);
      return length === 2 ? view.getUint16(0, isLittleEndian) : view.getUint32(0, isLittleEndian);
    } catch (error) {
      console.warn("Error reading integer:", error);
      return 0;
    }
  }

  const ifdOffset = readInt(4, 4);
  const result: Record<number, string> = {};

  try {
    const numEntries = readInt(ifdOffset, 2);
    
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifdOffset + 2 + (i * 12);
      const tag = readInt(entryOffset, 2);
      const type = readInt(entryOffset + 2, 2);
      const count = readInt(entryOffset + 4, 4);
      const valueOffset = readInt(entryOffset + 8, 4);

      // We're primarily interested in ASCII strings (type 2)
      if (type === 2) {
        try {
          const value = new TextDecoder().decode(
            exifData.slice(valueOffset, valueOffset + count - 1) // -1 to exclude null terminator
          );
          result[tag] = value;
        } catch (error) {
          console.warn(`Error decoding ASCII value for tag ${tag}:`, error);
        }
      }
    }
  } catch (error) {
    console.warn("Error parsing IFD:", error);
  }

  return result;
}

function copyUint8Array(src: Uint8Array): Uint8Array {
  // copyUint8Array
  const dst = new ArrayBuffer(src.byteLength);
  new Uint8Array(dst).set(new Uint8Array(src));
  return new Uint8Array(dst);
}
function modifyWebpExifData(
  exifData: Uint8Array,
  modifyExifData: Record<string, string>
): Uint8Array {
  let newExifData: Uint8Array = copyUint8Array(exifData);

  // Check for the correct TIFF header (0x4949 for little-endian or 0x4D4D for big-endian)
  const isLittleEndian = String.fromCharCode(...exifData.slice(0, 2)) === "II";

  // Function to read 16-bit and 32-bit integers from binary data
  function readInt(offset: number, length: number) {
    const arr = exifData.slice(offset, offset + length);
    const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    if (length === 2) {
      return view.getUint16(0, isLittleEndian);
    } else if (length === 4) {
      return view.getUint32(0, isLittleEndian);
    }
    throw new Error("Invalid length for integer");
  }

  // Function to write 16-bit and 32-bit integers to binary data
  function writeInt(offset: number, value: number, length: number) {
    const view = new DataView(
      newExifData.buffer,
      newExifData.byteOffset + offset,
      length
    );
    if (length === 2) {
      view.setUint16(0, value, isLittleEndian);
    } else if (length === 4) {
      view.setUint32(0, value, isLittleEndian);
    } else {
      throw new Error("Invalid length for integer");
    }
  }

  // Read the offset to the first IFD (Image File Directory)
  const ifdOffset = readInt(4, 4);

  function parseIFD(offset: number) {
    const numEntries = readInt(offset, 2);
    const result: Record<string, string> = {};
    let splicedOffset = 0;

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = offset + 2 + i * 12;
      const tag = readInt(entryOffset, 2);
      const type = readInt(entryOffset + 2, 2);
      const numValues = readInt(entryOffset + 4, 4);
      const valueOffset = readInt(entryOffset + 8, 4);

      // Read the value(s) based on the data type
      const TYPE_ASCII_string = 2;
      if (type === TYPE_ASCII_string) {
        const value = new TextDecoder("utf-8").decode(
          exifData.subarray(valueOffset, valueOffset + numValues)
        );

        // Check if we need to modify this value
        const newValue = modifyExifData[tag] ?? value;

        // Only modify if the value has changed
        if (newValue !== value) {
          // Add null terminator if needed
          const newValueWithNull = newValue.endsWith("\0")
            ? newValue
            : newValue + "\0";
          const newValueEncoded = new TextEncoder().encode(newValueWithNull);
          const newNumValues = newValueEncoded.length;

          // Update the number of values in the entry
          writeInt(entryOffset + 4, newNumValues, 4);

          // Calculate how much the data size has changed
          const lengthDiff = newValueEncoded.byteLength - numValues;

          // Replace the old value with the new one
          newExifData = uint8ArrayToSpliced(
            newExifData,
            splicedOffset + valueOffset,
            numValues,
            newValueEncoded
          );

          // Update the offset for future splices
          splicedOffset += lengthDiff;
        }

        result[tag] = value;
      }
    }

    return result;
  }

  // Parse the first IFD
  parseIFD(ifdOffset);

  return newExifData;
}
// [].splice()

export function uint8ArrayToSpliced(
  target: Uint8Array,
  offset: number,
  deleteLength: number,
  replaceValue: Uint8Array
): Uint8Array {
  const deleted = target.slice(offset, offset + deleteLength);

  return concatUint8Arrays([
    target.slice(0, offset),
    // target.slice(offset, offset+deleteLength), // deleted
    replaceValue, // replaced content
    target.slice(offset + deleteLength, Infinity), // slice from after
  ]);
}
export async function readWorkflowInfo(e: File | FileSystemFileHandle) {
  if (!(e instanceof File)) e = await e.getFile();
  const metadata =
    e.type === "image/webp"
      ? getWebpMetadata(await e.arrayBuffer())
      : e.type === "image/png"
      ? getPngMetadata(await e.arrayBuffer())
      : e.type === "audio/flac" || e.type === "audio/x-flac"
      ? getFlacMetadata(await e.arrayBuffer())
      : null;
  const previewUrl = URL.createObjectURL(e);
  const workflowJson = metadata?.workflow || metadata?.Workflow;
  return {
    name: e.name,
    workflowJson,
    previewUrl,
    file: e,
    lastModified: e.lastModified,
  };
}
