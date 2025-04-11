import { crc32FromArrayBuffer } from "crc32-from-arraybuffer";
import { concatUint8Arrays } from "uint8array-extras";

export function getPngMetadata(
  buffer: Uint8Array | ArrayBuffer,
): Record<string, string> {
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
        ...pngData.slice(offset + 8, keyword_end),
      );
      // Get the text
      const contentArraySegment = pngData.slice(
        keyword_end + 1,
        offset + 8 + length,
      );
      const contentJson = new TextDecoder("utf-8").decode(contentArraySegment);

      if (txt_chunks[keyword])
        console.warn(`Duplicated keyword ${keyword} has been overwritten`);
      txt_chunks[keyword] = contentJson;
    }

    offset += 12 + length;
  }
  return txt_chunks;
} /*
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
  new_txt_chunks: Record<string, string>,
): Uint8Array {
  // Get the PNG data as a Uint8Array
  const pngData = new Uint8Array(buffer);
  const newPngChunks: Uint8Array[] = [];
  const dataView = new DataView(pngData.buffer);

  // Check that the PNG signature is present
  if (dataView.getUint32(0) !== 0x89504e47)
    throw new Error("Not a valid PNG file");
  newPngChunks.push(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
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
        ...pngData.slice(offset + 8, keyword_end),
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
          offset + 8 + length,
        );
        // load old content
        const contentJson = new TextDecoder("utf-8").decode(
          contentArraySegment,
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
            keyword + "\x00" + new_txt_chunks[keyword],
          );

          const chunkLength = encoded.length;
          const chunkType = pngData.slice(offset + 4, offset + 8);

          // calculate crc32
          const crcTarget = new Uint8Array(
            chunkType.length + 4 + encoded.length,
          );
          crcTarget.set(chunkType, 0);
          crcTarget.set(new Uint8Array(chunkLength), chunkType.length);
          const chunkCRC32 = crc32FromArrayBuffer(crcTarget);
          if (new_txt_chunks[keyword] === contentJson && crc32 !== chunkCRC32) {
            console.warn(
              "warn: crc32 is not matched while content is not changed",
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
