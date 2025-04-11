import { getFlacMetadata } from "./exif-flac";
import { getPngMetadata } from "./exif-png";
import { getWebpMetadata } from "./exif-webp";

export async function readWorkflowInfo(e: File | FileSystemFileHandle) {
  if (!(e instanceof File)) e = await e.getFile();
  const metadata =
    e.type === "image/webp"
      ? getWebpMetadata(await e.arrayBuffer())
      : e.type === "image/png"
        ? getPngMetadata(await e.arrayBuffer())
        : e.type === "audio/flac" || e.type === "audio/x-flac"
          ? getFlacMetadata(await e.arrayBuffer())
          : null;
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
