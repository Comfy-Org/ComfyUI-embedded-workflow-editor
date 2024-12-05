"use client";
/*
1. this is an app to edit workflow in the embeded images
2. inputs:
  1. select comfyui output working_folder (working_folder selector)
  2. type prefix
  
*/
const comfyapiCandidates = [
  // comfy-cli
  "http://localhost:8188",
  // electron
  "http://localhost:8000",
  "http://localhost:8001",
];
