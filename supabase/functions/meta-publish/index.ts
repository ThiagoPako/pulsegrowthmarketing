import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const META_API_BASE = "https://graph.facebook.com/v21.0";
const RATE_LIMIT_DELAY_MS = 200;

interface PublishRequest {
  integration_id: string;
  client_id: string;
  publish_type: "feed" | "reels" | "stories";
  media_url: string;
  caption?: string;
  scheduled_time?: number; // Unix timestamp for scheduled posts
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMetaWithRetry(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    await delay(RATE_LIMIT_DELAY_MS);
    const response = await fetch(url, options);

    if (response.ok) return response;

    const body = await response.text();

    // Rate limited — exponential backoff
    if (response.status === 429 || body.includes("too many calls")) {
      const backoff = Math.pow(2, attempt) * 1000;
      console.log(`Rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`);
      await delay(backoff);
      continue;
    }

    // Temporary server error
    if (response.status >= 500) {
      const backoff = Math.pow(2, attempt) * 500;
      await delay(backoff);
      continue;
    }

    // Non-retryable error
    throw new Error(`Meta API error [${response.status}]: ${body}`);
  }

  throw new Error("Max retries exceeded for Meta API call");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: PublishRequest = await req.json();
    const { integration_id, client_id, publish_type, media_url, caption, scheduled_time } = body;

    if (!integration_id || !client_id || !publish_type || !media_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: integration_id, client_id, publish_type, media_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch integration config
    const { data: integration, error: intError } = await supabase
      .from("api_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: "Integration not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (integration.status !== "ativo") {
      return new Response(
        JSON.stringify({ error: "Integration is not active" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = integration.config || {};
    const pageToken = config.meta_page_token_encrypted || config.meta_page_token;
    const igBusinessId = config.meta_ig_business_id;
    const pageId = config.meta_page_id;

    if (!pageToken || !igBusinessId || !pageId) {
      throw new Error("Missing Meta credentials in integration config");
    }

    let result: any;

    if (publish_type === "feed") {
      // Publish photo/post to Facebook Page
      const params = new URLSearchParams({
        url: media_url,
        access_token: pageToken,
      });
      if (caption) params.set("caption", caption);
      if (scheduled_time) {
        params.set("published", "false");
        params.set("scheduled_publish_time", String(scheduled_time));
      }

      const response = await fetchMetaWithRetry(
        `${META_API_BASE}/${pageId}/photos?${params.toString()}`,
        { method: "POST" }
      );
      result = await response.json();
    } else if (publish_type === "reels") {
      // Step 1: Create container
      const containerParams = new URLSearchParams({
        media_type: "REELS",
        video_url: media_url,
        access_token: pageToken,
      });
      if (caption) containerParams.set("caption", caption);

      const containerRes = await fetchMetaWithRetry(
        `${META_API_BASE}/${igBusinessId}/media?${containerParams.toString()}`,
        { method: "POST" }
      );
      const containerData = await containerRes.json();
      const containerId = containerData.id;

      if (!containerId) throw new Error("Failed to create media container: " + JSON.stringify(containerData));

      // Step 2: Wait for processing (poll status)
      let ready = false;
      for (let i = 0; i < 30; i++) {
        await delay(2000);
        const statusRes = await fetchMetaWithRetry(
          `${META_API_BASE}/${containerId}?fields=status_code&access_token=${pageToken}`,
          { method: "GET" }
        );
        const statusData = await statusRes.json();
        if (statusData.status_code === "FINISHED") {
          ready = true;
          break;
        }
        if (statusData.status_code === "ERROR") {
          throw new Error("Media processing failed: " + JSON.stringify(statusData));
        }
      }

      if (!ready) throw new Error("Media processing timed out after 60s");

      // Step 3: Publish
      const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: pageToken,
      });

      const publishRes = await fetchMetaWithRetry(
        `${META_API_BASE}/${igBusinessId}/media_publish?${publishParams.toString()}`,
        { method: "POST" }
      );
      result = await publishRes.json();
    } else if (publish_type === "stories") {
      // Instagram Stories
      const isVideo = /\.(mp4|mov|webm)/i.test(media_url);
      const containerParams = new URLSearchParams({
        media_type: "STORIES",
        access_token: pageToken,
      });
      if (isVideo) {
        containerParams.set("video_url", media_url);
      } else {
        containerParams.set("image_url", media_url);
      }

      const containerRes = await fetchMetaWithRetry(
        `${META_API_BASE}/${igBusinessId}/media?${containerParams.toString()}`,
        { method: "POST" }
      );
      const containerData = await containerRes.json();

      if (isVideo) {
        // Wait for video processing
        for (let i = 0; i < 20; i++) {
          await delay(2000);
          const statusRes = await fetchMetaWithRetry(
            `${META_API_BASE}/${containerData.id}?fields=status_code&access_token=${pageToken}`,
            { method: "GET" }
          );
          const statusData = await statusRes.json();
          if (statusData.status_code === "FINISHED") break;
          if (statusData.status_code === "ERROR") throw new Error("Story video processing failed");
        }
      }

      const publishRes = await fetchMetaWithRetry(
        `${META_API_BASE}/${igBusinessId}/media_publish?creation_id=${containerData.id}&access_token=${pageToken}`,
        { method: "POST" }
      );
      result = await publishRes.json();
    }

    // Log success
    await supabase.from("api_integration_logs").insert({
      integration_id,
      action: `publicação ${publish_type}`,
      status: "success",
      details: { client_id, media_id: result?.id, publish_type },
    });

    // Update last checked
    await supabase.from("api_integrations").update({
      last_checked_at: new Date().toISOString(),
      last_error: null,
      status: "ativo",
    }).eq("id", integration_id);

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Meta publish error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
