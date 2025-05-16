/**
 * Media proxy endpoint to fetch external media files
 * This avoids CORS issues when loading media from external sources
 *
 * @author: snomiao <snomiao@gmail.com>
 */
/**
 * Detect content type from file buffer using magic numbers (file signatures)
 * @param buffer File buffer to analyze
 * @param fileName Optional filename for extension-based fallback
 * @returns Detected MIME type or empty string if unknown
 */
export async function detectContentType(
  buffer: ArrayBuffer,
  fileName?: string,
): Promise<string> {
  // Get the first bytes for signature detection
  const arr = new Uint8Array(buffer.slice(0, 16));

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    arr.length >= 8 &&
    arr[0] === 0x89 &&
    arr[1] === 0x50 &&
    arr[2] === 0x4e &&
    arr[3] === 0x47 &&
    arr[4] === 0x0d &&
    arr[5] === 0x0a &&
    arr[6] === 0x1a &&
    arr[7] === 0x0a
  ) {
    return "image/png";
  }

  // WEBP: 52 49 46 46 (RIFF) + size + 57 45 42 50 (WEBP)
  if (
    arr.length >= 12 &&
    arr[0] === 0x52 &&
    arr[1] === 0x49 &&
    arr[2] === 0x46 &&
    arr[3] === 0x46 &&
    arr[8] === 0x57 &&
    arr[9] === 0x45 &&
    arr[10] === 0x42 &&
    arr[11] === 0x50
  ) {
    return "image/webp";
  }

  // FLAC: 66 4C 61 43 (fLaC)
  if (
    arr.length >= 4 &&
    arr[0] === 0x66 &&
    arr[1] === 0x4c &&
    arr[2] === 0x61 &&
    arr[3] === 0x43
  ) {
    return "audio/flac";
  }

  // MP4/MOV: various signatures
  if (arr.length >= 12) {
    // ISO Base Media File Format (ISOBMFF) - check for MP4 variants
    // ftyp: 66 74 79 70
    if (
      arr[4] === 0x66 &&
      arr[5] === 0x74 &&
      arr[6] === 0x79 &&
      arr[7] === 0x70
    ) {
      // Common MP4 types: isom, iso2, mp41, mp42, etc.
      const brand = String.fromCharCode(arr[8], arr[9], arr[10], arr[11]);
      if (
        ["isom", "iso2", "mp41", "mp42", "avc1", "dash"].some((b) =>
          brand.includes(b),
        )
      ) {
        return "video/mp4";
      }
    }

    // moov: 6D 6F 6F 76
    if (
      arr[4] === 0x6d &&
      arr[5] === 0x6f &&
      arr[6] === 0x6f &&
      arr[7] === 0x76
    ) {
      return "video/mp4";
    }

    // mdat: 6D 64 61 74
    if (
      arr[4] === 0x6d &&
      arr[5] === 0x64 &&
      arr[6] === 0x61 &&
      arr[7] === 0x74
    ) {
      return "video/mp4";
    }
  }

  // Extension-based fallback for supported file types
  if (fileName) {
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (extension) {
      const extMap: Record<string, string> = {
        png: "image/png",
        webp: "image/webp",
        flac: "audio/flac",
        mp4: "video/mp4",
        mp3: "audio/mpeg",
        mov: "video/quicktime",
      };
      if (extMap[extension]) {
        return extMap[extension];
      }
    }
  }

  return "";
}
