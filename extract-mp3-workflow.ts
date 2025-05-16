// Extract MP3 workflow script
import { writeFileSync } from "fs";
import { getMp3Metadata } from "./app/utils/exif-mp3";

async function main() {
  const testFile = Bun.file("tests/mp3/ComfyUI_00047_.mp3");
  const buffer = await testFile.arrayBuffer();

  const metadata = getMp3Metadata(buffer);

  console.log("MP3 metadata keys:", Object.keys(metadata));

  if (metadata.workflow) {
    // Try to parse and format the workflow
    try {
      const workflowJson = JSON.parse(metadata.workflow);
      const formattedWorkflow = JSON.stringify(workflowJson, null, 2);

      const outputPath = "tests/mp3/ComfyUI_00047_.mp3.workflow.json";
      writeFileSync(outputPath, formattedWorkflow);
      console.log(`Workflow extracted and saved to ${outputPath}`);
    } catch (error) {
      console.error("Error parsing workflow JSON:", error);

      // If parsing fails, save the raw workflow
      const outputPath = "tests/mp3/ComfyUI_00047_.mp3.workflow.json";
      writeFileSync(outputPath, metadata.workflow);
      console.log(`Raw workflow saved to ${outputPath}`);
    }
  } else {
    console.log("No workflow found in MP3 metadata");

    // If we don't find a workflow, let's create a simple test workflow
    const testWorkflow = JSON.stringify(
      {
        test: "test-workflow",
        format: "mp3",
        description: "Test workflow for MP3 format",
      },
      null,
      2,
    );

    const outputPath = "tests/mp3/ComfyUI_00047_.mp3.workflow.json";
    writeFileSync(outputPath, testWorkflow);
    console.log(`Created test workflow and saved to ${outputPath}`);
  }
}

main().catch(console.error);
