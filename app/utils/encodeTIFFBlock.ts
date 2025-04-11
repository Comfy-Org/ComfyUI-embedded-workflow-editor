import { concatUint8Arrays } from "uint8array-extras";

export type IFDEntryInput = {
  tag: number;
  type: number;
  value: Uint8Array;
};

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
  }: { tailPadding?: number; isLittleEndian?: boolean } = {}
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
