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
        `WARNING: predictOffset ${predictOffset} !== offset ${offset}, your tiff block may be corrupted`
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
    tailPadding
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
