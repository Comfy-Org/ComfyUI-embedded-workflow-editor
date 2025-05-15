// Test script to verify MP4 metadata extraction works correctly
import { readFile } from 'fs/promises';
import { getMp4Metadata } from '../app/utils/exif-mp4';

async function testMp4Metadata() {
  console.log('Testing MP4 metadata extraction...');
  
  // Load the MP4 file
  try {
    const mp4Path = './tests/mp4/img2vid_00009_.mp4';
    const mp4Data = await readFile(mp4Path);
    console.log(`Loaded MP4 file: ${mp4Path} (${mp4Data.length} bytes)`);
    
    // Extract metadata
    const metadata = getMp4Metadata(mp4Data);
    console.log('Extracted metadata keys:', Object.keys(metadata));
    
    // Check if workflow data is present
    if (metadata.workflow) {
      console.log(`Workflow data found, length: ${metadata.workflow.length}`);
      
      try {
        // Try to parse as JSON to verify it's valid
        const workflowJson = JSON.parse(metadata.workflow);
        console.log('Valid workflow JSON extracted');
        console.log('Workflow ID:', workflowJson.id);
        console.log('Number of nodes:', workflowJson.nodes?.length);
        console.log('Number of links:', workflowJson.links?.length);
        
        // Load the reference workflow JSON
        const refPath = './tests/mp4/img2vid_00009_.mp4.workflow.json';
        const refData = await readFile(refPath, 'utf-8');
        const refJson = JSON.parse(refData);
        
        // Compare
        console.log('\nComparing with reference workflow:');
        console.log('Reference ID:', refJson.id);
        console.log('Reference nodes:', refJson.nodes?.length);
        console.log('Reference links:', refJson.links?.length);
        
        // Check if IDs match
        if (workflowJson.id === refJson.id) {
          console.log('✅ Workflow IDs match');
        } else {
          console.log('❌ Workflow IDs do not match');
        }
        
        // Check if node counts match
        if (workflowJson.nodes?.length === refJson.nodes?.length) {
          console.log('✅ Node counts match');
        } else {
          console.log('❌ Node counts do not match');
        }
        
        // Check if link counts match
        if (workflowJson.links?.length === refJson.links?.length) {
          console.log('✅ Link counts match');
        } else {
          console.log('❌ Link counts do not match');
        }
        
        console.log('\n✅ Test completed successfully');
      } catch (e) {
        console.error('Error parsing workflow JSON:', e);
      }
    } else {
      console.error('❌ No workflow data found in MP4 metadata');
    }
  } catch (error) {
    console.error('Error testing MP4 metadata:', error);
  }
}

// Run the test
testMp4Metadata().catch(console.error);
