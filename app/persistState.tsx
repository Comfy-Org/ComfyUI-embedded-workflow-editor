"use client";
import { proxy } from "valtio";

export const persistState = proxy({
  // comfy apoi
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
