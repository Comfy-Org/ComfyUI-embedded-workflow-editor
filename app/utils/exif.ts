import { getFlacMetadata, setFlacMetadata } from "./exif-flac";
import { getMp4Metadata, setMp4Metadata } from "./exif-mp4";
import { getPngMetadata, setPngMetadata } from "./exif-png";
import { getWebpMetadata, setWebpMetadata } from "./exif-webp";

export async function readWorkflowInfo(
  e: File | FileSystemFileHandle,
): Promise<{
  name: string;
  workflowJson: string;
  previewUrl: string;
  file: File;
  lastModified: number;
}> {
  if (!(e instanceof File)) e = await e.getFile();
  const handlers: Record<
    string,
    (buffer: ArrayBuffer) => Record<string, string>
  > = {
    "image/webp": getWebpMetadata,
    "image/png": getPngMetadata,
    "audio/flac": getFlacMetadata,
    "audio/x-flac": getFlacMetadata,
    "video/mp4": getMp4Metadata,
  };

  const handler = handlers[e.type];
  if (!handler) throw new Error(`Unsupported file type: ${e.type}`);

  const metadata = handler(await e.arrayBuffer());

  const previewUrl = URL.createObjectURL(e);
  const workflowJson = metadata?.workflow || metadata?.Workflow;
  return {
    name: e.name,
    workflowJson,
    previewUrl,
    file: e,
    lastModified: e.lastModified,
  };
}

/**
 * Save workflow metadata to a file
 * @param buffer The file buffer
 * @param fileType The MIME type of the file
 * @param metadata The metadata to save
 * @returns The modified file buffer
 */
export function saveWorkflowInfo(
  buffer: ArrayBuffer,
  fileType: string,
  metadata: Record<string, string>,
): Uint8Array {
  const handlers: Record<
    string,
    (buffer: ArrayBuffer, metadata: Record<string, string>) => Uint8Array
  > = {
    "image/webp": setWebpMetadata,
    "image/png": setPngMetadata,
    "audio/flac": setFlacMetadata,
    "audio/x-flac": setFlacMetadata,
    "video/mp4": setMp4Metadata,
  };

  const handler = handlers[fileType];
  if (!handler) {
    console.warn(`No handler for file type: ${fileType}`);
    throw new Error(`Unsupported file type: ${fileType}`);
  }

  return handler(buffer, metadata);
}
