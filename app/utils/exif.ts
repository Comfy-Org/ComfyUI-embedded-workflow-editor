// @ts-strict-ignore
export function getFromPngBuffer(buffer: ArrayBuffer) {
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
export function setToPngBuffer(
  buffer: ArrayBuffer,
  new_txt_chunks: Record<string, string>
) {
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
          console.warn("keyword", keyword);
          console.warn("content: ", contentJson);
          console.warn("crc32: ", crc32);
          console.warn("crc32(new): ", chunkCRC32);
          console.warn("length: ", length);
          console.warn("newLength: ", chunkLength);

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
  const newPngData = mergeUint8Chunks(newPngChunks);
  return newPngData;
}

function mergeUint8Chunks(newPngChunks: Uint8Array[]) {
  const retLength = newPngChunks.reduce((r, e) => r + e.length, 0);
  const newPngData = new Uint8Array(retLength);
  let len = 0;
  newPngChunks.forEach((e) => {
    newPngData.set(e, len);
    len += e.length;
  });
  return newPngData;
}

export function removeExt(f: string) {
  if (!f) return f;
  const p = f.lastIndexOf(".");
  if (p === -1) return f;
  return f.substring(0, p);
}
export async function getFromPngFile(file: File) {
  return getFromPngBuffer(await file.arrayBuffer());
}
// @ts-strict-ignore
export function getFromFlacBuffer(buffer: ArrayBuffer): Record<string, string> {
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

export async function getFromFlacFile(
  file: File
): Promise<Record<string, string>> {
  return getFromFlacBuffer(await file.arrayBuffer());
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

export async function getWebpMetadata(
  file: File
): Promise<Record<string, string>> {
  const webp = new Uint8Array(await file.arrayBuffer());
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
/**
 * - [WebP の構造を追ってみる 🏗 \| Basicinc Enjoy Hacking!]( https://tech.basicinc.jp/articles/177 )
 * WIP
 */
export async function setWebpMetadata_WIP(
  file: File,
  new_txt_chunks: Record<string, string>
): Promise<File> {
  const webp = new Uint8Array(await file.arrayBuffer());
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
        String.fromCharCode(...webp.slice(offset + 8, offset + 8 + 6)) ==
        "Exif\0\0"
      ) {
        offset += 6;
      }
      const data = decodeWebpExifData(
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
      // copy the EXIF chunk

      // newChunks.push(webp.slice(offset, offset + 8 + chunk_length));
      // copy from chunk end to file end
      // newChunks.push(webp.slice(offset + 8 + chunk_length));
      // break;
    } else {
      // copy the chunk
      newChunks.push(webp.slice(offset, offset + 8 + chunk_length));
    }

    offset += 8 + chunk_length;
  }
  const mergedChunks = mergeUint8Chunks(newChunks);
  return new File([mergedChunks], file.name, { type: file.type });
}

function decodeWebpExifData(exifData: Uint8Array): Record<string, string> {
  // Check for the correct TIFF header (0x4949 for little-endian or 0x4D4D for big-endian)
  const isLittleEndian = String.fromCharCode(...exifData.slice(0, 2)) === "II";

  // Function to read 16-bit and 32-bit integers from binary data
  function readInt(offset: number , isLittleEndian: boolean , length: number) {
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

  function parseIFD(offset:number) {
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
      }else {
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

// function encodeWebpExifData(
//   exifData: Record<string, string>
// ): Uint8Array {
//   // Create a new DataView to write the EXIF data
//   const dataView = new DataView(new ArrayBuffer(1024));
//   const encoder = new TextEncoder();

//   let offset = 0;
//   // Write the TIFF header
//   dataView.setUint16(offset, 0x4949, true); // Little-endian
//   dataView.setUint16(offset + 2, 42, true); // Version
//   offset += 4;
//   // Write the IFD (Image File Directory)
//   dataView.setUint16(offset, 1, true); // Number of entries
//   offset += 2;
//   // Write the EXIF tags
//   for (const [key, value] of Object.entries(exifData)) {
//     //
//       const tag = parseInt(key);
//       const type = 2; // ASCII string
//       const numValues = value.length + 1; // +1 for the null terminator
//       const valueOffset = offset + 12 + 12 * Object.keys(exifData).length;
//       dataView.setUint16(offset, tag, true);
//       dataView.setUint16(offset + 2, type, true);
//       dataView.setUint32(offset + 4, numValues, true);
//       dataView.setUint32(offset + 8, valueOffset, true);
//       offset += 12;
//       dataView.setUint8(valueOffset, ...encoder.encode(value));
//       dataView.setUint8(valueOffset + numValues - 1, 0); // Null terminator
//       // Write the EXIF data
//       // ...
//       // Write the IFD
//       dataView.setUint16(offset, Object.keys(exifData).length, true);
//       offset += 2;
//   }
// }

// Original functions left in for backwards compatibility
export function getPngMetadata(file: File): Promise<Record<string, string>> {
  // @ts-ignore
  return getFromPngFile(file)!;
}

export function getFlacMetadata(file: File): Promise<Record<string, string>> {
  return getFromFlacFile(file);
}

export async function readWorkflowInfo(e: File | FileSystemFileHandle) {
  if (!(e instanceof File)) e = await e.getFile();
  const metadata =
    e.type === "image/webp"
      ? await getWebpMetadata(e)
      : e.type === "image/png"
      ? await getPngMetadata(e)
      : e.type === "audio/flac" || e.type === "audio/x-flac"
      ? await getFromFlacFile(e)
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

// - [How to calculate the CRC of an arrayBuffer (From FileReader in javascript) compatible with the CRC32 function in php? - Stack Overflow]( https://stackoverflow.com/questions/29416900/how-to-calculate-the-crc-of-an-arraybuffer-from-filereader-in-javascript-compa )
function crc32FromArrayBuffer(ab: Uint8Array) {
  const table = new Uint32Array([
    0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419, 0x706af48f,
    0xe963a535, 0x9e6495a3, 0x0edb8832, 0x79dcb8a4, 0xe0d5e91e, 0x97d2d988,
    0x09b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91, 0x1db71064, 0x6ab020f2,
    0xf3b97148, 0x84be41de, 0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7,
    0x136c9856, 0x646ba8c0, 0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9,
    0xfa0f3d63, 0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172,
    0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b, 0x35b5a8fa, 0x42b2986c,
    0xdbbbc9d6, 0xacbcf940, 0x32d86ce3, 0x45df5c75, 0xdcd60dcf, 0xabd13d59,
    0x26d930ac, 0x51de003a, 0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423,
    0xcfba9599, 0xb8bda50f, 0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924,
    0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d, 0x76dc4190, 0x01db7106,
    0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f, 0x9fbfe4a5, 0xe8b8d433,
    0x7807c9a2, 0x0f00f934, 0x9609a88e, 0xe10e9818, 0x7f6a0dbb, 0x086d3d2d,
    0x91646c97, 0xe6635c01, 0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e,
    0x6c0695ed, 0x1b01a57b, 0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950,
    0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65,
    0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2, 0x4adfa541, 0x3dd895d7,
    0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a, 0x346ed9fc, 0xad678846, 0xda60b8d0,
    0x44042d73, 0x33031de5, 0xaa0a4c5f, 0xdd0d7cc9, 0x5005713c, 0x270241aa,
    0xbe0b1010, 0xc90c2086, 0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
    0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17, 0x2eb40d81,
    0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6, 0x03b6e20c, 0x74b1d29a,
    0xead54739, 0x9dd277af, 0x04db2615, 0x73dc1683, 0xe3630b12, 0x94643b84,
    0x0d6d6a3e, 0x7a6a5aa8, 0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1,
    0xf00f9344, 0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb,
    0x196c3671, 0x6e6b06e7, 0xfed41b76, 0x89d32be0, 0x10da7a5a, 0x67dd4acc,
    0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5, 0xd6d6a3e8, 0xa1d1937e,
    0x38d8c2c4, 0x4fdff252, 0xd1bb67f1, 0xa6bc5767, 0x3fb506dd, 0x48b2364b,
    0xd80d2bda, 0xaf0a1b4c, 0x36034af6, 0x41047a60, 0xdf60efc3, 0xa867df55,
    0x316e8eef, 0x4669be79, 0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
    0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe, 0xb2bd0b28,
    0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31, 0x2cd99e8b, 0x5bdeae1d,
    0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x026d930a, 0x9c0906a9, 0xeb0e363f,
    0x72076785, 0x05005713, 0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38,
    0x92d28e9b, 0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21, 0x86d3d2d4, 0xf1d4e242,
    0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
    0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c, 0x8f659eff, 0xf862ae69,
    0x616bffd3, 0x166ccf45, 0xa00ae278, 0xd70dd2ee, 0x4e048354, 0x3903b3c2,
    0xa7672661, 0xd06016f7, 0x4969474d, 0x3e6e77db, 0xaed16a4a, 0xd9d65adc,
    0x40df0b66, 0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
    0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605, 0xcdd70693,
    0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8, 0x5d681b02, 0x2a6f2b94,
    0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d,
  ]);

  let crc = 0 ^ -1;
  const dsArr = new Uint8Array(ab);
  for (let i = 0; i < ab.byteLength; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ dsArr[i]) & 0xff];
  }

  return (crc ^ -1) >>> 0;
}

// const crc32 = (function () {
//   var table = []
//   for (var i = 0; i < 256; i++) {
//     var c = i
//     for (var j = 0; j < 8; j++) {
//       c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
//     }
//     table.push(c)
//   }
//   return function (str, crc) {
//     str = unescape(encodeURIComponent(str))
//     if (!crc) crc = 0
//     crc = crc ^ (-1)
//     for (var i = 0; i < str.length; i++) {
//       var y = (crc ^ str.charCodeAt(i)) & 0xff
//       crc = (crc >>> 8) ^ table[y]
//     }
//     crc = crc ^ (-1)
//     return crc >>> 0
//   }
// })()
