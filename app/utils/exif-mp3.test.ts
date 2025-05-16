import { getMp3Metadata, setMp3Metadata } from "./exif-mp3";

test("MP3 metadata extraction", () => {
  // Read test MP3 file
  const testFilePath = path.join(
    process.cwd(),
    "tests/mp3/ComfyUI_00047_.mp3"
  );
  const buffer = fs.readFileSync(testFilePath);

  // Extract metadata
  const metadata = getMp3Metadata(buffer);
  
  // Log the metadata to see what's available
  console.log("MP3 metadata:", metadata);
  
  // Basic test to ensure the function runs without errors
  expect(metadata).toBeDefined();
});

test("MP3 metadata write and read", () => {
  // Read test MP3 file
  const testFilePath = path.join(
    process.cwd(),
    "tests/mp3/ComfyUI_00047_.mp3"
  );
  const buffer = fs.readFileSync(testFilePath);
  
  // Create test workflow JSON
  const testWorkflow = JSON.stringify({
    test: "workflow",
    nodes: [{ id: 1, name: "Test Node" }]
  });
  
  // Set metadata
  const modified = setMp3Metadata(buffer, { workflow: testWorkflow });
  
  // Read back the metadata
  const readMetadata = getMp3Metadata(modified);
  
  // Verify the workflow was written and read correctly
  expect(readMetadata.workflow).toBe(testWorkflow);
});

test("MP3 metadata update", () => {
  // Read test MP3 file
  const testFilePath = path.join(
    process.cwd(),
    "tests/mp3/ComfyUI_00047_.mp3"
  );
  const buffer = fs.readFileSync(testFilePath);
  
  // First, add some metadata
  const modified1 = setMp3Metadata(buffer, { 
    title: "Test Title",
    artist: "ComfyUI"
  });
  
  // Then, update the title but keep the artist
  const modified2 = setMp3Metadata(modified1, {
    title: "Updated Title",
    workflow: "Test Workflow"
  });
  
  // Read back the metadata
  const readMetadata = getMp3Metadata(modified2);
  
  // Verify updates
  expect(readMetadata.title).toBe("Updated Title");
  expect(readMetadata.workflow).toBe("Test Workflow");
});
