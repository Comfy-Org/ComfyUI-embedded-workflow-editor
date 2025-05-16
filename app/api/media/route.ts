import { detectContentType } from "./detectContentType";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The main handler with integrated error handling
export async function GET(request: Request) {
  // Get the URL parameter from the request
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  // Check if URL parameter is provided
  if (!url) {
    return new Response(
      JSON.stringify({ error: "URL parameter is required" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow cross-origin access
        },
      }
    );
  }

  // Fetch the content from the external URL
  const response = await fetch(url);

  if (!response.ok) {
    return new Response(
      JSON.stringify({
        error: `Failed to fetch from URL: ${response.statusText}`,
      }),
      {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow cross-origin access
        },
      }
    );
  }

  // Get the original content type and filename
  let contentType = response.headers.get("content-type") || "";
  // Try to get filename from Content-Disposition header, fallback to URL
  let fileName = "file";
  const contentDisposition = response.headers.get("content-disposition");
  if (contentDisposition) {
    const match = contentDisposition.match(
      /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i
    );
    if (match && match[1]) {
      fileName = decodeURIComponent(match[1]);
    }
  }
  if (fileName === "file") {
    const urlPath = new URL(url).pathname;
    const urlFileName = urlPath.split("/").pop() || "file";
    // Only use the filename from URL if it includes an extension
    if (/\.[a-zA-Z0-9]+$/i.test(urlFileName)) {
      fileName = urlFileName;
    }
    // If the filename does not have an extension, guess from contentType
    else if (!/\.[a-z0-9]+$/i.test(fileName) && contentType) {
      const extMap: Record<string, string> = {
        "image/png": "png",
        "image/webp": "webp",
        "audio/flac": "flac",
        "video/mp4": "mp4",
      };
      const guessedExt = extMap[contentType.split(";")[0].trim()];
      if (guessedExt) {
        fileName += `.${guessedExt}`;
      }
    }
  }

  // If content type is not octet-stream, return the response directly to reduce latency
  if (
    contentType &&
    contentType !== "application/octet-stream" &&
    contentType !== "binary/octet-stream"
  ) {
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Access-Control-Allow-Origin": "*", // Allow cross-origin access
        "Cache-Control": "public, max-age=86400", // Cache for 24 hours
      },
    });
  }

  // For unknown or generic content types, process further
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();

  // Detect content type from file signature, especially if the content type is generic or missing
  if (
    !contentType ||
    contentType === "application/octet-stream" ||
    contentType === "binary/octet-stream"
  ) {
    const detectedContentType = await detectContentType(arrayBuffer, fileName);
    if (detectedContentType) {
      contentType = detectedContentType;
    }
  }

  // Check if the file type is supported
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  const isSupported = ["png", "webp", "flac", "mp4"].some(
    (ext) => contentType.includes(ext) || extension === ext
  );

  if (!isSupported) {
    return new Response(
      JSON.stringify({
        error: `Unsupported file format: ${contentType || extension}`,
      }),
      {
        status: 415, // Unsupported Media Type
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow cross-origin access
        },
      }
    );
  }

  // Return the original content with appropriate headers
  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Access-Control-Allow-Origin": "*", // Allow cross-origin access
      "Cache-Control": "public, max-age=86400", // Cache for 24 hours
    },
  });
}
