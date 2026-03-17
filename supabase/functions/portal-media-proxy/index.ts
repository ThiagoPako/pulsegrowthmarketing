const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const ALLOWED_MEDIA_ORIGIN = "https://agenciapulse.tech";
const ALLOWED_MEDIA_PATH_PREFIX = "/uploads/";

function guessContentType(url: string) {
  if (/\.mp4(\?|$)/i.test(url)) return "video/mp4";
  if (/\.webm(\?|$)/i.test(url)) return "video/webm";
  if (/\.mov(\?|$)/i.test(url)) return "video/quicktime";
  if (/\.avi(\?|$)/i.test(url)) return "video/x-msvideo";
  return "application/octet-stream";
}

function isAllowedMediaUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.origin === ALLOWED_MEDIA_ORIGIN && parsed.pathname.startsWith(ALLOWED_MEDIA_PATH_PREFIX);
  } catch {
    return false;
  }
}

async function getTargetUrl(req: Request) {
  if (req.method === "GET") {
    return new URL(req.url).searchParams.get("url");
  }

  const body = await req.json().catch(() => null);
  return typeof body?.url === "string" ? body.url : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  try {
    const targetUrl = await getTargetUrl(req);

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    if (!isAllowedMediaUrl(targetUrl)) {
      return new Response(JSON.stringify({ error: "URL not allowed" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const upstreamHeaders = new Headers();
    const range = req.headers.get("range");
    const accept = req.headers.get("accept");

    if (range) upstreamHeaders.set("Range", range);
    if (accept) upstreamHeaders.set("Accept", accept);

    const upstreamResponse = await fetch(targetUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      return new Response(JSON.stringify({
        error: "Failed to fetch upstream media",
        status: upstreamResponse.status,
      }), {
        status: upstreamResponse.status,
        headers: jsonHeaders,
      });
    }

    const responseHeaders = new Headers(corsHeaders);
    const passthroughHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
      "last-modified",
    ];

    for (const header of passthroughHeaders) {
      const value = upstreamResponse.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }

    if (!responseHeaders.get("content-type")) {
      responseHeaders.set("content-type", guessContentType(targetUrl));
    }

    if (!responseHeaders.get("accept-ranges")) {
      responseHeaders.set("accept-ranges", "bytes");
    }

    if (!responseHeaders.get("cache-control")) {
      responseHeaders.set("cache-control", "public, max-age=3600");
    }

    responseHeaders.set("Content-Disposition", "inline");
    responseHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
    responseHeaders.set("X-Content-Type-Options", "nosniff");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("portal-media-proxy error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unexpected error",
    }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
