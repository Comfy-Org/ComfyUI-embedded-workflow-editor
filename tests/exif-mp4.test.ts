import { getMp4Metadata, setMp4Metadata } from "@/app/utils/exif-mp4";
import { glob } from "glob";

test("extract MP4 metadata", async () => {
  const mp4s = await glob("./tests/mp4/*.mp4");
  expect(mp4s.length).toBeGreaterThan(0);

  for await (const filename of mp4s) {
    const mp4 = Bun.file(filename);

    // Get the metadata
    const metadata = getMp4Metadata(await mp4.arrayBuffer());

    // Verify some basic properties about the metadata
    expect(metadata).toBeDefined();
    expect(typeof metadata).toBe("object");
    console.log(metadata);

    const referenceFile = filename.replace(/$/, ".workflow.json");
    const referenceFileExists = await Bun.file(referenceFile).exists();
    if (referenceFileExists) {
      const referenceFileContent = await Bun.file(referenceFile).json();
      const referenceMetadata = JSON.stringify(referenceFileContent);
      const actualMetadata = JSON.stringify(JSON.parse(metadata.workflow));
      expect(actualMetadata).toEqual(referenceMetadata);
    } else {
      console.warn(`No reference workflow file found for ${filename}`);
    }

    console.log(`Metadata for ${filename}:`, metadata);
  }
});

test("invalid MP4 files throw errors", async () => {
  // Create a non-MP4 file for testing
  const invalidData = new Uint8Array([0, 1, 2, 3]);

  // Verify it doesn't throw an error but returns empty object
  expect(getMp4Metadata(invalidData)).toEqual({});
});

test("set and get workflow data", async () => {
  // Create a sample MP4 file
  const sampleMp4File = await glob("./tests/mp4/*.mp4");

  if (sampleMp4File.length > 0) {
    const mp4File = Bun.file(sampleMp4File[0]);
    const originalBuffer = await mp4File.arrayBuffer();

    // Sample workflow data
    const sampleWorkflow = JSON.stringify({
      test: "workflow data",
      nodes: { id1: { class_type: "TestNode" } },
    });

    // Set the metadata
    const modifiedBuffer = setMp4Metadata(originalBuffer, {
      workflow: sampleWorkflow,
    });

    // Get the metadata back
    const retrievedMetadata = getMp4Metadata(modifiedBuffer);

    // Verify the workflow data was correctly stored and retrieved
    expect(retrievedMetadata.workflow).toBeDefined();
    expect(JSON.stringify(JSON.parse(retrievedMetadata.workflow))).toEqual(
      sampleWorkflow,
    );

    // Verify other existing metadata is preserved if there was any
    const originalMetadata = getMp4Metadata(originalBuffer);
    console.log("originalMetadata", originalMetadata);
    console.log("retrievedMetadata", retrievedMetadata);
    for (const key of Object.keys(originalMetadata)) {
      if (key !== "workflow") {
        expect(retrievedMetadata[key]).toEqual(originalMetadata[key]);
      }
    }
  } else {
    console.warn("No MP4 sample files found for testing setMp4Metadata");
  }
});

test("handle large workflow data", async () => {
  const mp4s = await glob("./tests/mp4/*.mp4");

  if (mp4s.length > 0) {
    const mp4 = Bun.file(mp4s[0]);

    // Create a large workflow object
    const largeWorkflow = JSON.stringify({
      test: "x".repeat(1000),
      array: Array(100).fill("test"),
      nested: { deep: { deeper: { deepest: "value" } } },
    });

    const buffer = setMp4Metadata(await mp4.arrayBuffer(), {
      workflow: largeWorkflow,
    });

    const metadata = getMp4Metadata(buffer);
    expect(metadata.workflow).toBe(largeWorkflow);
  } else {
    console.warn("No MP4 sample files found for testing large workflow data");
  }
});
