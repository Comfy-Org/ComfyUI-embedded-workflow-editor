import { readFile } from "fs/promises";
import { getMp4Metadata } from "../app/utils/exif-mp4";

async function main() {
  try {
    const buffer = await readFile("./tests/mp4/img2vid_00009_.mp4");
    console.log("File size:", buffer.length);
    const metadata = getMp4Metadata(buffer.buffer);
    console.log("Metadata found:", Object.keys(metadata));
    console.log("Workflow exists:", !!metadata.workflow);

    if (metadata.workflow) {
      console.log(
        "Workflow preview:",
        metadata.workflow.substring(0, 100) + "...",
      );
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
