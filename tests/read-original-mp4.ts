import { readFile } from 'fs/promises';
import { getMp4Metadata } from '../app/utils/exif-mp4';

async function main() {
  try {
    // Read the original MP4 file
    console.log('Reading original MP4 file...');
    const mp4Buffer = await readFile('./tests/mp4/img2vid_00009_.mp4');
    console.log('MP4 file size:', mp4Buffer.length);
    
    // Extract metadata from the file
    console.log('Extracting metadata...');
    const metadata = getMp4Metadata(mp4Buffer.buffer);
    
    // Check if workflow data exists
    if (metadata.workflow) {
      console.log('Workflow data found!');
      console.log('Workflow preview:', metadata.workflow.substring(0, 100) + '...');
      
      // Save the workflow to a file for comparison
      console.log('Saving extracted workflow to file...');
      await readFile('./tests/mp4/img2vid_00009_.mp4.workflow.json', 'utf8')
        .then((originalWorkflow) => {
          const originalJson = JSON.stringify(JSON.parse(originalWorkflow));
          const extractedJson = JSON.stringify(JSON.parse(metadata.workflow));
          console.log('Matches the workflow.json file:', originalJson === extractedJson);
        })
        .catch(() => {
          console.log('Original workflow file not found for comparison');
        });
    } else {
      console.log('No workflow data found in the original MP4 file');
      console.log('Available metadata keys:', Object.keys(metadata));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
