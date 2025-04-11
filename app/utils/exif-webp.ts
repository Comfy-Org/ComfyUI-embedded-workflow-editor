import { concatUint8Arrays } from "uint8array-extras";

// Reference: - [Exiv2 - Image metadata library and tools]( https://exiv2.org/tags.html )
export const EXIF_TAGS = {
  // Using ImageDescription tag for workflow
  ImageDescription: 0x010e, // Exif.Image.ImageDescription 270

  // Using Make tag for workflow
  Make: 0x010f, // Exif.Image.Make 271 workflow

  // comfyanonymous/ComfyUI is Using Model tag for prompt
  // https://github.com/comfyanonymous/ComfyUI/blob/98bdca4cb2907ad10bd24776c0b7587becdd5734/comfy_extras/nodes_images.py#L116C1-L116C74
  // metadata[0x0110] = "prompt:{}".format(json.dumps(prompt))
  Model: 0x0110, // Exif.Image.Model 272 prompt:

  UserComment: 0x9286, // Exif.Photo.UserComment 37510
  Copyright: 0x8298, // Exif.Image.Copyright 33432

  // we use Copyright tag for workflow
  WorkflowTag: 0x8298, // Exif.Image.Copyright 33432
};

export type IFDEntryInput = {
  tag: number;
  type: number;
  value: Uint8Array;
};

export type IFDEntryOutput = {
  tag: number;
  type: number;
  count: number;

  offset: number;
  value: Uint8Array;

  // ignore stored offset, use predicted offset
  predictOffset: number;
  predictValue: Uint8Array;
  ascii?: string;
};

/**
 * @author snomiao@gmail.com
 * Decodes a TIFF block with the given IFD entries.
 * ref: - [TIFF - Image File Format]( https://docs.fileformat.com/image/tiff/ )
 *
 * And also trying to fix the issue of `offset` and `predictOffset` not matching
 * in the original code, the offset is calculated based on the current position
 * in the buffer, but it should be based on the start of the IFD.
 *
 * The `predictOffset` is the offset of the next entry in the IFD, which is
 * calculated based on the current position in the buffer.
 *
 * supports only single IFD section
 */
export function decodeTIFFBlock(block: Uint8Array): {
  isLittleEndian: boolean;
  ifdOffset: number;
  numEntries: number;
  entries: IFDEntryOutput[];
  tailPadding: number;
} {
  const view = new DataView(block.buffer);
  const isLE = String.fromCharCode(...block.slice(0, 2)) === "II";
  const ifdOffset = view.getUint32(4, isLE);
  const numEntries = view.getUint16(ifdOffset, isLE);
  let tailPadding = 0;
  const entries: IFDEntryOutput[] = [];

  let predictOffset = ifdOffset + 2 + numEntries * 12 + 4; // 2 bytes for count, 4 bytes for next IFD offset
  for (let i = 0; i < numEntries; i++) {
    if (predictOffset % 2) predictOffset += 1; // WORD size padding

    const entryOffset = ifdOffset + 2 + i * 12;
    const tag = view.getUint16(entryOffset, isLE);
    const type = view.getUint16(entryOffset + 2, isLE);
    const count = view.getUint32(entryOffset + 4, isLE);
    const offset = view.getUint32(entryOffset + 8, isLE);
    if (offset !== predictOffset) {
      console.warn(
        `WARNING: predictOffset ${predictOffset} !== offset ${offset}, your tiff block may be corrupted`,
      );
    }

    const value = block.slice(offset, offset + count);
    const predictValue = block.slice(predictOffset, predictOffset + count);

    const ascii =
      type !== 2
        ? undefined
        : (function () {
            // trying to fix the issue of `offset` and `predictOffset` not matching
            // in the original code, the offset is calculated based on the current position
            // in the buffer, but it should be based on the start of the IFD.
            // The `predictOffset` is the offset of the next entry in the IFD, which is
            // calculated based on the current position in the buffer.

            const decodedValue = new TextDecoder().decode(value.slice(0, -1));
            return !decodedValue.includes("\0")
              ? decodedValue
              : new TextDecoder().decode(predictValue.slice(0, -1));
          })();

    entries.push({
      tag,
      type,
      count,
      value,
      offset,
      predictValue,
      predictOffset,
      ...(ascii && { ascii }),
    });
    predictOffset += count;
  }

  tailPadding = block.length - predictOffset;

  console.log(
    predictOffset === block.length,
    predictOffset,
    block.length,
    tailPadding,
  );
  // entries.map((entry) =>
  //   console.log([...entry.value].map((e) => Number(e).toString(16)).join(' ') + '\n')
  // );
  // entries.map((entry) => console.log(entry.ascii + "\n"));

  return {
    isLittleEndian: isLE,
    ifdOffset,
    numEntries,
    entries,
    tailPadding,
  };
}
/**
 * @author snomiao@gmail.com
 * Encodes a TIFF block with the given IFD entries.
 * ref: - [TIFF - Image File Format]( https://docs.fileformat.com/image/tiff/ )
 *
 * supports only single IFD section
 */

export function encodeTIFFBlock(
  ifdEntries: IFDEntryInput[],
  {
    tailPadding = 0,
    isLittleEndian = true,
  }: { tailPadding?: number; isLittleEndian?: boolean } = {},
): Uint8Array {
  const tiffHeader = new Uint8Array(8);
  tiffHeader.set(new TextEncoder().encode(isLittleEndian ? "II" : "MM"), 0); // little-endian or big-endian
  new DataView(tiffHeader.buffer).setUint16(2, 42, isLittleEndian); // TIFF magic number
  new DataView(tiffHeader.buffer).setUint32(4, 8, isLittleEndian); // offset to first IFD

  // Calculate sizes and offsets
  const ifdSize = 2 + ifdEntries.length * 12 + 4; // count + entries + next IFD offset
  let valueOffset = tiffHeader.length + ifdSize;

  // Create IFD
  const ifd = new Uint8Array(ifdSize);
  const ifdView = new DataView(ifd.buffer);
  ifdView.setUint16(0, ifdEntries.length, isLittleEndian); // Number of entries

  // Write entries and collect values
  const values: Uint8Array[] = [];

  ifdEntries.forEach((entry, i) => {
    // Write entry head padding
    if (valueOffset % 2) {
      const padding = new Uint8Array(1);
      values.push(padding); // word padding
      valueOffset += 1; // word padding
    }

    const entryOffset = 2 + i * 12;
    ifdView.setUint16(entryOffset, entry.tag, isLittleEndian);
    ifdView.setUint16(entryOffset + 2, entry.type, isLittleEndian);
    ifdView.setUint32(entryOffset + 4, entry.value.length, isLittleEndian);
    ifdView.setUint32(entryOffset + 8, valueOffset, isLittleEndian);

    values.push(entry.value);
    valueOffset += entry.value.length;
  });

  // Write next IFD offset
  ifdView.setUint32(ifdSize - 4, 0, isLittleEndian); // No next IFD

  // Write tail padding
  const tailPaddingBuffer = new Uint8Array(tailPadding);

  // Concatenate all parts
  const tiffBlock = concatUint8Arrays([
    tiffHeader,
    ifd,
    ...values,
    tailPaddingBuffer,
  ]);

  // console.log("LEN", tiffBlock.length);
  return tiffBlock;
}

export function getWebpMetadata(
  buffer: Uint8Array | ArrayBuffer,
): Record<string, string> {
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
    offset += 8;
    if (chunk_type === "EXIF") {
      let exifHeaderLength = 0;
      if (String.fromCharCode(...webp.slice(offset, offset + 6)) === "Exif\0\0")
        exifHeaderLength = 6;

      const data = decodeTIFFBlock(
        webp.slice(offset + exifHeaderLength, offset + chunk_length),
      );
      data.entries
        .map(({ ascii }) => ascii!)
        .filter((e) => e)
        .map((value) => {
          const index = value.indexOf(":");
          if (index === -1) {
            console.warn("No colon found in Exif data for value:", value);
            return;
          }
          txt_chunks[value.slice(0, index)] = value.slice(index + 1);
        });
      offset += chunk_length;
    } else {
      offset += chunk_length;
    }
    offset += chunk_length % 2;
  }
  return txt_chunks;
}
/**
 * - [WebP の構造を追ってみる 🏗 \| Basicinc Enjoy Hacking!]( https://tech.basicinc.jp/articles/177 )
 * WIP
 */
export function setWebpMetadata(
  buffer: ArrayBuffer | Uint8Array,
  modifyRecords: Record<string, string>,
): Uint8Array {
  const webp = new Uint8Array(buffer);
  const newChunks: Uint8Array[] = [];
  const dataView = new DataView(webp.buffer);

  // Validate WebP header
  if (
    String.fromCharCode(...webp.slice(0, 0 + 4)) !== "RIFF" ||
    String.fromCharCode(...webp.slice(8, 8 + 4)) !== "WEBP"
  ) {
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
      offset += 8;
      let exifHeaderLength = 0;

      // Skip for Exif\0\0 header
      if (String.fromCharCode(...webp.slice(offset, offset + 6)) === "Exif\0\0")
        exifHeaderLength = 6;

      const tiffBlockOriginal = webp.slice(
        offset + exifHeaderLength,
        offset + chunk_length,
      );
      const tiff = decodeTIFFBlock(tiffBlockOriginal);
      // console.log(tiff);
      const { entries, isLittleEndian, tailPadding } = tiff;
      // modify Exif data
      const encodeEntries: IFDEntryInput[] = entries;
      entries.forEach(({ ascii }, i, a) => {
        if (!ascii) return;
        const index = ascii.indexOf(":");
        if (index === -1) {
          console.warn("No colon found in Exif data for value:", ascii);
          return;
        }
        const [key, value] = [ascii.slice(0, index), ascii.slice(index + 1)];
        encodeEntries[i].value = new TextEncoder().encode(
          `${key}:${modifyRecords[key] ?? value}\0`,
        );
        delete modifyRecords[key]; // mark used
      });

      // Add new entries for remaining modifyRecords
      if (Object.keys(modifyRecords).length > 0) {
        Object.entries(modifyRecords).forEach(([key, value], i) => {
          encodeEntries.push({
            tag: EXIF_TAGS.Make - i, // 271 and 270 and 269 and so on
            type: 2,
            value: new TextEncoder().encode(`${key}:${value}\0`),
          });
        });
      }

      const tiffBlock = encodeTIFFBlock(encodeEntries, {
        isLittleEndian,
        tailPadding,
      });

      // Create EXIF chunk
      const newChunkLength = exifHeaderLength + tiffBlock.length;
      const chunkHeader = new Uint8Array(8);
      const headerView = new DataView(chunkHeader.buffer);
      chunkHeader.set(new TextEncoder().encode("EXIF"), 0);
      headerView.setUint32(4, newChunkLength, true);
      const exifHeader = exifHeaderLength
        ? new TextEncoder().encode("Exif\0\0")
        : new Uint8Array(0);
      const padding =
        newChunkLength % 2 ? new Uint8Array([0]) : new Uint8Array(0);
      //
      const chunkContent = concatUint8Arrays([
        chunkHeader,
        exifHeader,
        tiffBlock,
        padding,
      ]);
      newChunks.push(chunkContent);
      offset += 8 + paddedLength;
    } else {
      newChunks.push(webp.slice(offset, offset + 8 + paddedLength));
      offset += 8 + paddedLength;
    }
  }

  if (Object.keys(modifyRecords).length > 0 && exifChunkFound) {
    console.warn("Warning: Found exif chunk but fail to modify it");
  }
  // if no EXIF section was found, add new metadata chunks
  if (Object.keys(modifyRecords).length > 0 && !exifChunkFound) {
    // Exif Header
    const exifHeader = new TextEncoder().encode("Exif\0\0");

    // Create TIFF Block
    const ifdEntries: IFDEntryInput[] = Object.entries(modifyRecords).map(
      ([key, value], i) => {
        return {
          tag: EXIF_TAGS.Make - i, // 271 and 270 and 269 and so on
          type: 2, // ASCII
          value: new TextEncoder().encode(`${key}:${value}\0`),
        };
      },
    );
    const tiffBlock = encodeTIFFBlock(ifdEntries);

    // Combine all parts
    const exifContent = concatUint8Arrays([exifHeader, tiffBlock]);

    // Create EXIF chunk header
    const chunkHeader = new Uint8Array(8);
    const headerView = new DataView(chunkHeader.buffer);
    chunkHeader.set(new TextEncoder().encode("EXIF"), 0);
    headerView.setUint32(4, exifContent.length, true);

    // Add chunk padding if needed
    const padding =
      exifContent.length % 2 ? new Uint8Array([0]) : new Uint8Array(0);

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
