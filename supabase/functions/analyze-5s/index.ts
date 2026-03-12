// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * analyze-5s Edge Function — Phase 1 Architecture
 * ─────────────────────────────────────────────────
 * NEW FLOW (deterministic, industrial-grade):
 *
 *  Images (Base64)
 *      │
 *      ▼
 *  CV Engine (FastAPI + YOLOv8 + OpenCV)   ← Deterministic math scoring
 *      │  Returns: scores + metrics
 *      ▼
 *  Gemini API                               ← Explanation ONLY, never scores
 *      │  Returns: professional report text
 *      ▼
 *  Structured JSON Response to Frontend
 *
 * OLD FLOW (deprecated):
 *   Images → Gemini → Score + Text (non-deterministic, not reproducible)
 *
 * Environment Variables Required:
 *   CV_ENGINE_URL   — URL of the deployed FastAPI CV engine
 *   GEMINI_API_KEY  — Passed through to CV engine for explanations
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { beforeImage, afterImage } = await req.json();

    if (!beforeImage || !afterImage) {
      return new Response(
        JSON.stringify({ error: "Both before and after images are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const CV_ENGINE_URL = Deno.env.get("CV_ENGINE_URL");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    // ── Phase 1: Use the new CV Engine if configured ─────────────────────────
    if (CV_ENGINE_URL) {
      console.log(`[analyze-5s] Calling CV Engine at: ${CV_ENGINE_URL}`);

      const cvResponse = await fetch(`${CV_ENGINE_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          before_image: beforeImage,
          after_image: afterImage,
          gemini_api_key: GEMINI_API_KEY,
        }),
      });

      if (!cvResponse.ok) {
        const errorText = await cvResponse.text();
        console.error(`[analyze-5s] CV Engine error: ${cvResponse.status} ${errorText}`);
        // Fall through to Gemini-only fallback below
        console.warn("[analyze-5s] Falling back to Gemini-only mode");
      } else {
        const cvData = await cvResponse.json();
        console.log(`[analyze-5s] CV Engine success — scoring method: ${cvData.scoring_method}`);

        // Transform CV engine response to match the frontend's expected schema
        const transformed = transformCVResponse(cvData);

        return new Response(JSON.stringify(transformed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn(
        "[analyze-5s] CV_ENGINE_URL not set — using Gemini-only fallback. " +
        "Deploy the cv-engine and set CV_ENGINE_URL to enable deterministic scoring."
      );
    }

    // ── Fallback: Original Gemini-only mode (kept for backward compatibility) ─
    if (!GEMINI_API_KEY) {
      throw new Error("Neither CV_ENGINE_URL nor GEMINI_API_KEY is configured.");
    }

    return await runGeminiFallback(beforeImage, afterImage, GEMINI_API_KEY, corsHeaders);
  } catch (e) {
    console.error("analyze-5s error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Transforms the CV Engine's snake_case response into the camelCase schema
 * the existing frontend already expects (no frontend changes needed).
 */
function transformCVResponse(cv: Record<string, any>): Record<string, any> {
  const toPercent = (score20: number) => Math.round(Math.min(100, score20 * 5));

  const mapScores = (s: Record<string, number>) => ({
    sort: toPercent(s.sort),
    setInOrder: toPercent(s.set_in_order),
    shine: toPercent(s.shine),
    standardize: toPercent(s.standardize),
    sustain: toPercent(s.sustain),
  });

  const mapExplanations = (e: Record<string, string>) => ({
    sort: e.sort ?? "",
    setInOrder: e.set_in_order ?? "",
    shine: e.shine ?? "",
    standardize: e.standardize ?? "",
    sustain: e.sustain ?? "",
  });

  return {
    overview: cv.overview,
    beforeScores: mapScores(cv.before_scores),
    afterScores: mapScores(cv.after_scores),
    beforeExplanations: mapExplanations(cv.before_explanations),
    afterExplanations: mapExplanations(cv.after_explanations),
    recommendations: cv.recommendations ?? [],
    improvements: cv.improvements ?? [],
    leanMaintenanceScore: cv.before_scores?.lean_maintenance ?? 0,
    leanMaintenanceScoreAfter: cv.after_scores?.lean_maintenance ?? 0,
    leanMaintenanceExplanation: cv.lean_maintenance_explanation ?? "",
    // Audit metadata — new fields the frontend can display
    scoringMethod: cv.scoring_method,
    beforeMetrics: cv.before_metrics,
    afterMetrics: cv.after_metrics,
  };
}

/**
 * Original Gemini-only fallback (preserved for backward compatibility
 * when CV_ENGINE_URL is not yet configured).
 */
async function runGeminiFallback(
  beforeImage: string,
  afterImage: string,
  apiKey: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const systemPrompt = `You are a 5S workplace organization expert analyst. You will receive two images: a "before" image showing a workspace before organization, and an "after" image showing the same workspace after organization efforts.

Analyze both images against the 5S methodology and return a JSON object with this exact structure (no markdown, pure JSON only):

{
  "overview": "A 2-3 sentence summary of the overall analysis comparing before and after states",
  "beforeScores": {
    "sort": <0-100>,
    "setInOrder": <0-100>,
    "shine": <0-100>,
    "standardize": <0-100>,
    "sustain": <0-100>
  },
  "afterScores": {
    "sort": <0-100>,
    "setInOrder": <0-100>,
    "shine": <0-100>,
    "standardize": <0-100>,
    "sustain": <0-100>
  },
  "beforeExplanations": {
    "sort": "explanation",
    "setInOrder": "explanation",
    "shine": "explanation",
    "standardize": "explanation",
    "sustain": "explanation"
  },
  "afterExplanations": {
    "sort": "explanation",
    "setInOrder": "explanation",
    "shine": "explanation",
    "standardize": "explanation",
    "sustain": "explanation"
  },
  "recommendations": ["rec 1", "rec 2", "rec 3", "rec 4", "rec 5"],
  "improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "leanMaintenanceScore": <0-100>,
  "leanMaintenanceExplanation": "explanation",
  "scoringMethod": "Gemini Vision (Fallback — CV Engine not configured)"
}

Score criteria:
- Sort (Seiri): Are unnecessary items removed?
- Set in Order (Seiton): Are items logically organized and labeled?
- Shine (Seiso): Is the area clean and well-maintained?
- Standardize (Seiketsu): Are there visual standards, labels, color coding?
- Sustain (Shitsuke): Does the space suggest ongoing discipline?

IMPORTANT: Reference specific visual observations for every score explanation.`;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        temperature: 0,
        top_p: 1,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze these workspace images. First is BEFORE, second is AFTER. Return JSON only.",
              },
              { type: "image_url", image_url: { url: beforeImage } },
              { type: "image_url", image_url: { url: afterImage } },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content;
  if (!content) throw new Error("No response from Gemini");

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Gemini response");

  const analysisData = JSON.parse(jsonMatch[0]);
  return new Response(JSON.stringify(analysisData), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
