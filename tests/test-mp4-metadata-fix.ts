import fs from "fs/promises";
import { getMp4Metadata } from "../app/utils/exif-mp4";

async function testMp4MetadataExtraction() {
  console.log("Testing MP4 metadata extraction...");

  try {
    // Read the MP4 file
    const filePath = "./tests/mp4/img2vid_00009_.mp4";
    const buffer = await fs.readFile(filePath);

    console.log(`Read file: ${filePath}, size: ${buffer.length} bytes`);

    // Extract metadata
    const metadata = getMp4Metadata(buffer);

    console.log("Extracted metadata keys:", Object.keys(metadata));

    // Check if workflow data was extracted
    if (metadata.workflow) {
      console.log(`Found workflow data of length: ${metadata.workflow.length}`);

      try {
        // Validate it's JSON
        const workflow = JSON.parse(metadata.workflow);
        console.log("Successfully parsed workflow as JSON");
        console.log("Workflow ID:", workflow.id);
        console.log("Node count:", workflow.nodes?.length || 0);
        console.log("Link count:", workflow.links?.length || 0);

        // Save the extracted workflow to compare with the reference
        await fs.writeFile(
          "./extracted-workflow.json",
          JSON.stringify(workflow, null, 2),
        );
        console.log("Saved extracted workflow to extracted-workflow.json");

        // Compare with reference file
        const referenceWorkflowPath =
          "./tests/mp4/img2vid_00009_.mp4.workflow.json";
        const referenceWorkflow = JSON.parse(
          await fs.readFile(referenceWorkflowPath, "utf-8"),
        );

        console.log("Reference workflow ID:", referenceWorkflow.id);
        console.log(
          "Reference node count:",
          referenceWorkflow.nodes?.length || 0,
        );
        console.log(
          "Reference link count:",
          referenceWorkflow.links?.length || 0,
        );

        if (workflow.id === referenceWorkflow.id) {
          console.log("✅ Workflow IDs match");
        } else {
          console.log("❌ Workflow IDs do not match");
        }

        if (workflow.nodes?.length === referenceWorkflow.nodes?.length) {
          console.log("✅ Node counts match");
        } else {
          console.log("❌ Node counts do not match");
        }

        if (workflow.links?.length === referenceWorkflow.links?.length) {
          console.log("✅ Link counts match");
        } else {
          console.log("❌ Link counts do not match");
        }
      } catch (e) {
        console.error("Error parsing workflow JSON:", e);
      }
    } else {
      console.log("No workflow data found in metadata");
    }
  } catch (error) {
    console.error("Error testing MP4 metadata extraction:", error);
  }
}

testMp4MetadataExtraction();
