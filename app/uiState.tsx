import { proxy } from "valtio";

export const uiState = proxy({
  // select output folder
  working_folder: null as null | FileSystemDirectoryHandle,
});
