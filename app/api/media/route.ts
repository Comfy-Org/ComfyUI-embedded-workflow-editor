/**
 * Media proxy endpoint to fetch external media files
 * This avoids CORS issues when loading media from external sources
 *
 * @author: snomiao <snomiao@gmail.com>
 */
export async function GET(request: Request) {
  try {
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
          },
        },
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
          },
        },
      );
    }

    // Get the original content type and filename
    const contentType = response.headers.get("content-type") || "";
    // Try to get filename from Content-Disposition header, fallback to URL
    let fileName = "file";
    const contentDisposition = response.headers.get("content-disposition");
    if (contentDisposition) {
      const match = contentDisposition.match(
        /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i,
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

    // Check if the file type is supported
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    const isSupported = ["png", "webp", "flac", "mp4"].some(
      (ext) => contentType.includes(ext) || extension === ext,
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
          },
        },
      );
    }

    // Get the blob content
    const blob = await response.blob();

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
  } catch (error) {
    console.error("Error in media proxy:", error);
    return new Response(
      JSON.stringify({
        error: `Internal server error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
