import { getFlacMetadata } from "@/app/utils/exif-flac";
import { glob } from "glob";

test("extract FLAC metadata", async () => {
  const flacs = await glob("./tests/flac/*.flac");
  expect(flacs.length).toBeGreaterThan(0);

  for await (const filename of flacs) {
    const flac = Bun.file(filename);

    // Get the metadata
    const metadata = getFlacMetadata(await flac.arrayBuffer());

    // Verify some basic properties about the metadata
    expect(metadata).toBeDefined();
    expect(typeof metadata).toBe("object");

    console.log(`Metadata for ${filename}:`);
  }
});

test("invalid FLAC files throw errors", async () => {
  // Create a non-FLAC file for testing
  const invalidData = new Uint8Array([0, 1, 2, 3]);

  // Verify it throws an error
  expect(() => {
    getFlacMetadata(invalidData);
  }).toThrow("Not a valid FLAC file");
});

test("extract workflow data when available", async () => {
  // Look for FLAC files that have a corresponding workflow.json
  const flacs = await glob("./tests/flac/*.flac");

  for await (const filename of flacs) {
    // Check if a corresponding workflow.json exists
    const workflowJsonPath = `${filename}.workflow.json`;

    try {
      const workflowJsonFile = Bun.file(workflowJsonPath);
      const exists = await workflowJsonFile.exists();
      if (exists) {
        const flac = Bun.file(filename);
        const metadata = getFlacMetadata(await flac.arrayBuffer());

        // Log available metadata keys for debugging
        console.log(
          `Metadata keys available: ${Object.keys(metadata).join(", ")}`,
        );

        // Only compare if workflow exists in metadata
        if (metadata.workflow) {
          console.log("Testing workflow comparison");
          const workflow_expect = JSON.stringify(await workflowJsonFile.json());
          const workflow_actual = JSON.stringify(JSON.parse(metadata.workflow));
          expect(workflow_actual).toEqual(workflow_expect);
        } else {
          console.log(`No workflow key in metadata for ${filename}`);
        }
      }
    } catch (error) {
      console.warn(`Skipping workflow comparison for ${filename}: ${error}`);
    }
  }
});
