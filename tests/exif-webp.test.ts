import { getWebpMetadata, setWebpMetadata } from "@/app/utils/exif";
import { glob } from "glob";

describe("WebP EXIF metadata", () => {
  it("should handle files with no existing metadata", async () => {
    const files = await glob("./tests/*.webp");
    expect(files.length).toBeGreaterThanOrEqual(1);
    const webp = Bun.file(files[0]);
    
    // First strip any existing metadata by creating a new file
    const stripped = new File([await webp.arrayBuffer()], "test.webp");
    const emptyMetadata = getWebpMetadata(await stripped.arrayBuffer());
    expect(emptyMetadata.workflow).toBeUndefined();
    
    // Then add new metadata
    const newWorkflow = '{"test":"new metadata"}';
    const buffer = setWebpMetadata(await stripped.arrayBuffer(), {
      workflow: newWorkflow
    });
    
    // Verify the metadata was added correctly
    const metadata = getWebpMetadata(buffer);
    expect(metadata.workflow).toBe(newWorkflow);
  });

  it("should preserve workflow key format for ComfyUI compatibility", async () => {
    const files = await glob("./tests/*.webp");
    expect(files.length).toBeGreaterThanOrEqual(1);
    const webp = Bun.file(files[0]);
    
    const workflowData = '{"test":"workflow data"}';
    const buffer = setWebpMetadata(await webp.arrayBuffer(), {
      workflow: workflowData
    });
    
    // Read raw EXIF data to verify format
    const exifData = await extractExifChunk(buffer);
    expect(exifData).toContain("workflow:");
    
    // Verify it can be read back
    const metadata = getWebpMetadata(buffer);
    expect(metadata.workflow).toBe(workflowData);
  });

  it("should handle multiple save operations", async () => {
    const files = await glob("./tests/*.webp");
    expect(files.length).toBeGreaterThanOrEqual(1);
    const webp = Bun.file(files[0]);
    
    // First save
    const workflow1 = '{"version":1}';
    const buffer1 = setWebpMetadata(await webp.arrayBuffer(), {
      workflow: workflow1
    });
    
    // Second save
    const workflow2 = '{"version":2}';
    const buffer2 = setWebpMetadata(buffer1, {
      workflow: workflow2
    });
    
    // Verify only the latest version exists
    const metadata = getWebpMetadata(buffer2);
    expect(metadata.workflow).toBe(workflow2);
  });

  it("should handle invalid WebP files gracefully", () => {
    const invalidBuffer = new ArrayBuffer(10);
    expect(() => getWebpMetadata(invalidBuffer)).not.toThrow();
    expect(getWebpMetadata(invalidBuffer)).toEqual({});
  });

  it("should handle empty workflow values", async () => {
    const files = await glob("./tests/*.webp");
    const webp = Bun.file(files[0]);
    
    const emptyWorkflow = '{}';
    const buffer = setWebpMetadata(await webp.arrayBuffer(), {
      workflow: emptyWorkflow
    });
    
    const metadata = getWebpMetadata(buffer);
    expect(metadata.workflow).toBe(emptyWorkflow);
  });

  it("should handle single metadata field", async () => {
    const files = await glob("./tests/*.webp");
    const webp = Bun.file(files[0]);
    
    // Add workflow metadata
    const workflow = '{"test":"data"}';
    const buffer = setWebpMetadata(await webp.arrayBuffer(), {
      workflow: workflow
    });
    
    // Verify the workflow data exists
    const metadata = getWebpMetadata(buffer);
    expect(metadata.workflow).toBe(workflow);
  });

  it("should handle malformed workflow JSON gracefully", async () => {
    const files = await glob("./tests/*.webp");
    const webp = Bun.file(files[0]);
    
    const malformedWorkflow = '{"test": broken json';
    const buffer = setWebpMetadata(await webp.arrayBuffer(), {
      workflow: malformedWorkflow
    });
    
    // Should still save and retrieve the malformed data
    const metadata = getWebpMetadata(buffer);
    expect(metadata.workflow).toBe(malformedWorkflow);
  });

  it("should handle large workflow data", async () => {
    const files = await glob("./tests/*.webp");
    const webp = Bun.file(files[0]);
    
    // Create a large workflow object
    const largeWorkflow = JSON.stringify({
      test: "x".repeat(1000),
      array: Array(100).fill("test"),
      nested: { deep: { deeper: { deepest: "value" } } }
    });
    
    const buffer = setWebpMetadata(await webp.arrayBuffer(), {
      workflow: largeWorkflow
    });
    
    const metadata = getWebpMetadata(buffer);
    expect(metadata.workflow).toBe(largeWorkflow);
  });

  it("should maintain byte alignment in EXIF chunk", async () => {
    const files = await glob("./tests/*.webp");
    const webp = Bun.file(files[0]);
    
    const workflow = '{"test":"data"}';
    const buffer = setWebpMetadata(await webp.arrayBuffer(), {
      workflow: workflow
    });
    
    // Verify chunk alignment
    const chunks = await getAllChunks(buffer);
    chunks.forEach(chunk => {
      expect(chunk.length % 2).toBe(0, "Chunk length should be even");
    });
  });
});

// Helper function to extract EXIF chunk from WebP file
async function extractExifChunk(buffer: ArrayBuffer): Promise<string> {
  const webp = new Uint8Array(buffer);
  const dataView = new DataView(webp.buffer);
  let offset = 12; // Skip RIFF header and WEBP signature
  
  while (offset < webp.length) {
    const chunk_type = String.fromCharCode(...webp.slice(offset, offset + 4));
    const chunk_length = dataView.getUint32(offset + 4, true);
    
    if (chunk_type === "EXIF") {
      const exifData = webp.slice(offset + 8, offset + 8 + chunk_length);
      return new TextDecoder().decode(exifData);
    }
    
    offset += 8 + chunk_length + (chunk_length % 2);
  }
  
  return "";
}

// Helper function to get all chunks from WebP file
async function getAllChunks(buffer: ArrayBuffer): Promise<Uint8Array[]> {
  const webp = new Uint8Array(buffer);
  const dataView = new DataView(webp.buffer);
  let offset = 12; // Skip RIFF header and WEBP signature
  const chunks: Uint8Array[] = [];
  
  while (offset < webp.length) {
    const chunk_length = dataView.getUint32(offset + 4, true);
    const paddedLength = chunk_length + (chunk_length % 2);
    chunks.push(webp.slice(offset, offset + 8 + paddedLength));
    offset += 8 + paddedLength;
  }
  
  return chunks;
}
