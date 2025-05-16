import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Official Next.js middleware for the media API
 * Runs before the route handlers and can modify the request/response
 *
 * @author: snomiao <snomiao@gmail.com>
 */

export const config = {
  // Only run on /api/media routes
  matcher: "/api/media/:path*",
};

export default async function middleware(request: NextRequest) {
  try {
    // Clone the request to pass it through
    const url = request.nextUrl.clone();

    // Proceed to the route handler, but we'll modify the response on the way back
    const response = NextResponse.next();

    // Set CORS headers for all responses from this endpoint
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");

    // Set caching header for successful responses
    response.headers.set("Cache-Control", "public, max-age=86400"); // 24 hours

    // Let the request proceed to the route handler
    return response;
  } catch (error) {
    // Handle any errors that occur in the middleware itself
    console.error("Error in media middleware:", error);

    // Return a standardized error response
    return new NextResponse(
      JSON.stringify({
        error: `Middleware error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
}

// Handle OPTIONS requests for CORS preflight
export function middleware_options(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400", // 24 hours
      },
    });
  }
}
