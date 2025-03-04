import { crc32FromArrayBuffer } from "crc32-from-arraybuffer";
import { concatUint8Arrays } from "uint8array-extras";

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
): Uint8Array<ArrayBufferLike> {
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
      while (pngData[keyword_end] !== 0) {
        keyword_end++;
      }
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

  // Concatenate the new PNG chunks
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
  const txt_chunks = {};
  // Loop through the chunks in the WEBP file
  while (offset < webp.length) {
    const chunk_length = dataView.getUint32(offset + 4, true);
    const chunk_type = String.fromCharCode(...webp.slice(offset, offset + 4));
    if (chunk_type === "EXIF") {
      if (
        String.fromCharCode(...webp.slice(offset + 8, offset + 8 + 6)) ==
        "Exif\0\0"
      ) {
        offset += 6;
      }
      let data = decodeWebpExifData(
        webp.slice(offset + 8, offset + 8 + chunk_length)
      );
      for (let key in data) {
        // @ts-ignore
        const value = data[key] as string;
        if (typeof value === "string") {
          const index = value.indexOf(":");
          // @ts-ignore
          txt_chunks[value.slice(0, index)] = value.slice(index + 1);
        }
      }
      break;
    }

    offset += 8 + chunk_length;
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
) {
  const webp = new Uint8Array(buffer);
  const newChunks: Uint8Array[] = [];
  const dataView = new DataView(webp.buffer);

  // Check that the WEBP signature is present
  if (
    dataView.getUint32(0) !== 0x52494646 ||
    dataView.getUint32(8) !== 0x57454250
  ) {
    throw new Error("Not a valid WEBP file");
  }
  // copy the chunks before the EXIF chunk
  newChunks.push(webp.slice(0, 12));

  // Start searching for chunks after the WEBP signature
  let offset = 12;
  const txt_chunks: Record<string, string> = {};
  // Loop through the chunks in the WEBP file
  while (offset < webp.length) {
    const chunk_type = String.fromCharCode(...webp.slice(offset, offset + 4));
    const chunk_length = dataView.getUint32(offset + 4, true);
    if (chunk_type === "EXIF") {
      if (
        String.fromCharCode(...webp.slice(offset + 8, offset + 8 + 6)) ===
        "Exif\0\0"
      ) {
        offset += 6;
      }
      const chunkContent = webp.slice(offset + 8, offset + 8 + chunk_length);
      const data = decodeWebpExifData(chunkContent);
      const modifiedData = Object.fromEntries(
        Object.entries(data).map(([k, v]) => {
          const idx = v.indexOf(":");
          if (idx === -1) return [k, v];
          if (modifyRecords[v.slice(0, idx)]) {
            const value =
              v.slice(0, idx) + ":" + modifyRecords[v.slice(0, idx)];
            delete modifyRecords[v.slice(0, idx)]; // used
            return [k, value];
          }
          return [k, v];
        })
      );
      if(Object.entries(modifyRecords).length){
        throw new Error("Unable to modify webp metadata", {cause: modifyRecords})
      }
      const newChunkContent = modifyWebpExifData(chunkContent, modifiedData);

      const newChunk_length = newChunkContent.length;

      for (let key in data) {
        const value = data[key] as string;
        if (typeof value === "string") {
          const index = value.indexOf(":");
          txt_chunks[value.slice(0, index)] = value.slice(index + 1);
        }
      }
      // push new length
      const newChunk_lengthArray = new Uint8Array(4);
      new DataView(newChunk_lengthArray.buffer).setUint32(
        0,
        newChunk_length,
        true
      );

      // push modified content
      newChunks.push(webp.slice(offset, offset + 4)); //type
      newChunks.push(newChunk_lengthArray); //
      newChunks.push(newChunkContent);
    } else {
      // copy the chunk
      newChunks.push(webp.slice(offset, offset + 8 + chunk_length));
    }

    offset += 8 + chunk_length;
  }
  return concatUint8Arrays(newChunks);
}

function decodeWebpExifData(exifData: Uint8Array): Record<string, string> {
  // Check for the correct TIFF header (0x4949 for little-endian or 0x4D4D for big-endian)
  const isLittleEndian = String.fromCharCode(...exifData.slice(0, 2)) === "II";

  // Function to read 16-bit and 32-bit integers from binary data
  function readInt(offset: number, isLittleEndian: boolean, length: number) {
    let arr = exifData.slice(offset, offset + length);
    if (length === 2) {
      return new DataView(arr.buffer, arr.byteOffset, arr.byteLength).getUint16(
        0,
        isLittleEndian
      );
    } else if (length === 4) {
      return new DataView(arr.buffer, arr.byteOffset, arr.byteLength).getUint32(
        0,
        isLittleEndian
      );
    }
    throw new Error("Invalid length for integer");
  }

  // Read the offset to the first IFD (Image File Directory)
  const ifdOffset = readInt(4, isLittleEndian, 4);

  function parseIFD(offset: number) {
    const numEntries = readInt(offset, isLittleEndian, 2);
    const result: Record<string, string> = {};

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = offset + 2 + i * 12;
      const tag = readInt(entryOffset, isLittleEndian, 2);
      const type = readInt(entryOffset + 2, isLittleEndian, 2);
      const numValues = readInt(entryOffset + 4, isLittleEndian, 4);
      const valueOffset = readInt(entryOffset + 8, isLittleEndian, 4);

      // Read the value(s) based on the data type
      let value;
      if (type === 2) {
        // ASCII string
        value = new TextDecoder("utf-8").decode(
          exifData.subarray(valueOffset, valueOffset + numValues - 1)
        );
      } else {
        throw new Error("Unsupported data type");
      }

      result[tag] = value;
    }

    return result;
  }

  // Parse the first IFD
  const ifdData = parseIFD(ifdOffset);
  return ifdData;
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

  // Function to read 16-bit and 32-bit integers from binary data
  function writeInt(offset: number, value: number, length: number) {
    const arr = newExifData.subarray(offset, offset + length); // subarray is writable, compared with slice
    const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    if (length === 2) {
      return view.setUint16(0, value, isLittleEndian);
    } else if (length === 4) {
      return new DataView(arr.buffer, arr.byteOffset, arr.byteLength).setUint32(
        0,
        value,
        isLittleEndian
      );
    }
    throw new Error("Invalid length for integer");
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
      const value = (function getValue() {
        if (type === TYPE_ASCII_string) {
          return new TextDecoder("utf-8").decode(
            exifData.subarray(valueOffset, valueOffset + numValues)
          );
        } else {
          throw new Error("Unsupported data type");
        }
      })();
      const newValue = modifyExifData[tag] ?? value;
      const newValueEncoded = new TextEncoder().encode(newValue + "\0");
      const newNumValues = numValues + (newValueEncoded.length - numValues);
      writeInt(entryOffset + 4, newNumValues, 4);
      const lengthDiff = newValueEncoded.byteLength - numValues;

      newExifData = uint8ArrayToSpliced(
        newExifData,
        splicedOffset + valueOffset,
        numValues,
        newValueEncoded
      );

      splicedOffset += lengthDiff;
      // const newNumValues = numValues + ((newValueEncoded.length)-(numValues-1))

      result[tag] = value;
    }

    return result;
  }

  // Parse the first IFD
  const ifdData = parseIFD(ifdOffset);

  return newExifData;
  // return ifdData;
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
