import { readFile, writeFile } from 'fs/promises';
import { getMp4Metadata, setMp4Metadata } from '../app/utils/exif-mp4';

async function main() {
  try {
    // Read the MP4 file
    const mp4Buffer = await readFile('./tests/mp4/img2vid_00009_.mp4');
    console.log('Original MP4 file size:', mp4Buffer.length);
    
    // Read the workflow JSON
    const workflowJson = await readFile('./tests/mp4/img2vid_00009_.mp4.workflow.json', 'utf8');
    console.log('Workflow JSON size:', workflowJson.length);
    
    // Embed the workflow into the MP4
    const metadata = { workflow: workflowJson };
    const newMp4Buffer = setMp4Metadata(mp4Buffer.buffer, metadata);
    console.log('New MP4 file size:', newMp4Buffer.length);
    
    // Save the new MP4 file
    await writeFile('./tests/mp4/img2vid_00009_with_workflow.mp4', newMp4Buffer);
    console.log('Created new MP4 file with embedded workflow');
    
    // Read the metadata from the new file to verify
    const newFileBuffer = await readFile('./tests/mp4/img2vid_00009_with_workflow.mp4');
    const extractedMetadata = getMp4Metadata(newFileBuffer.buffer);
    console.log('Metadata extraction successful:', !!extractedMetadata.workflow);
    
    if (extractedMetadata.workflow) {
      // Normalize the JSON by parsing and stringifying
      const originalJson = JSON.stringify(JSON.parse(workflowJson));
      const extractedJson = JSON.stringify(JSON.parse(extractedMetadata.workflow));
      
      // Verify the workflow matches
      console.log('Workflow matches original:', extractedJson === originalJson);
      console.log('Workflow preview:', extractedMetadata.workflow.substring(0, 100) + '...');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
