import { getMp3Metadata, setMp3Metadata } from "./exif-mp3";

test("MP3 metadata extraction", async () => {
  // Read test MP3 file
  const testFile = Bun.file("tests/mp3/ComfyUI_00047_.mp3");
  const buffer = await testFile.arrayBuffer();

  // Extract metadata
  const metadata = getMp3Metadata(buffer);
  
  // Log the metadata to see what's available
  console.log("MP3 metadata:", metadata);
  
  // Basic test to ensure the function runs without errors
  expect(metadata).toBeDefined();
});

test("MP3 metadata write and read", async () => {
  // Read test MP3 file
  const testFile = Bun.file("tests/mp3/ComfyUI_00047_.mp3");
  const buffer = await testFile.arrayBuffer();
  
  // Create test workflow JSON
  const testWorkflow = JSON.stringify({
    test: "workflow",
    nodes: [{ id: 1, name: "Test Node" }]
  });
  
  // Set metadata - now we can pass the Buffer directly
  const modified = setMp3Metadata(buffer, { workflow: testWorkflow });
  
  // Read back the metadata
  const readMetadata = getMp3Metadata(modified);
  
  // Verify the workflow was written and read correctly
  expect(readMetadata.workflow).toBe(testWorkflow);
});

test("MP3 metadata update", async () => {
  // Read test MP3 file
  const testFile = Bun.file("tests/mp3/ComfyUI_00047_.mp3");
  const buffer = await testFile.arrayBuffer();
  
  // First, add some metadata - now we can pass the Buffer directly
  const modified1 = setMp3Metadata(buffer, { 
    title: "Test Title",
    artist: "ComfyUI"
  });
  
  // Then, update the title but keep the artist - no need for conversion
  const modified2 = setMp3Metadata(modified1, {
    title: "Updated Title",
    workflow: "Test Workflow"
  });
  
  // Read back the metadata
  const readMetadata = getMp3Metadata(modified2);
  
  // Verify updates
  expect(readMetadata.title).toBe("Updated Title");
  expect(readMetadata.workflow).toBe("Test Workflow");
  expect(readMetadata.artist).toBe("ComfyUI"); // Artist should be preserved
});

test("MP3 metadata preservation", async () => {
  // Read test MP3 file
  const testFile = Bun.file("tests/mp3/ComfyUI_00047_.mp3");
  const originalBuffer = await testFile.arrayBuffer();
  
  // Get original metadata
  const originalMetadata = getMp3Metadata(originalBuffer);
  console.log("Original metadata keys:", Object.keys(originalMetadata));
  
  // Sample workflow data
  const sampleWorkflow = JSON.stringify({
    test: "workflow data",
    nodes: { id1: { class_type: "TestNode" } },
  });
  
  // Update only the workflow
  const modifiedBuffer = setMp3Metadata(originalBuffer, {
    workflow: sampleWorkflow,
  });
  
  // Get the updated metadata
  const updatedMetadata = getMp3Metadata(modifiedBuffer);
  
  // Verify the workflow was updated
  expect(updatedMetadata.workflow).toBeDefined();
  expect(updatedMetadata.workflow).toEqual(sampleWorkflow);
  
  // Verify other existing metadata is preserved
  for (const key of Object.keys(originalMetadata)) {
    if (key !== "workflow") {
      console.log(`Checking preservation of ${key}`);
      expect(updatedMetadata[key]).toEqual(originalMetadata[key]);
    }
  }
});
