"use client";
import { proxy } from "valtio";

export const persistState = proxy({
  // comfy api, not used yet, but may be used in the future if we want re-run the workflow after saving
  comfyapi: "http://127.0.0.1:8188",
  connected: false,
  connecting: false,

  // select working workflow
  autosave: false,

  editing_index: -1,
  editing_filename: "",
  editing_workflow_json: "",

  error: ''
});
