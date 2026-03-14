// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "5s-images";

/**
 * save-analysis-log Edge Function — Phase 1 Update
 * ──────────────────────────────────────────────────
 * New behaviour:
 *  1. Upload before/after images to Supabase Storage bucket "5s-images"
 *     — This is the DATA FLYWHEEL for training future YOLO models.
 *  2. Save storage paths (not raw Base64) in analysis_logs table.
 *  3. Track scoring_method and cv_metrics from the new CV engine.
 *
 * The raw Base64 is no longer stored in the DB (too large).
 * Instead we store the storage bucket path and generate signed URLs on demand.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      employeeId,
      employeeName,
      department,
      officeName,
      beforeImage,
      afterImage,
      analysisResult,
      scoringMethod,
      cvMetrics,
      // Geo metadata from camera capture
      beforeGeo,
      afterGeo,
      capturedAt,
    } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Upload images to Storage (Data Flywheel) ─────────────────────────────
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeDept = (department || "unknown").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const safeEmpId = (employeeId || "unknown").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const pathPrefix = `${safeDept}/${safeEmpId}/${timestamp}`;

    let beforeImagePath: string | null = null;
    let afterImagePath: string | null = null;

    const uploadImage = async (base64: string, label: "before" | "after") => {
      try {
        // Strip data URL prefix and decode
        const raw = base64.includes(",") ? base64.split(",")[1] : base64;
        const binary = atob(raw);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const path = `${pathPrefix}/${label}.jpg`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, bytes, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (error) {
          console.error(`[save-log] Storage upload failed for ${label}:`, error.message);
          return null;
        }
        console.log(`[save-log] Uploaded ${label} image to ${path}`);
        return path;
      } catch (e) {
        console.error(`[save-log] Image upload error (${label}):`, e);
        return null;
      }
    };

    // Upload both images concurrently
    if (beforeImage && afterImage) {
      [beforeImagePath, afterImagePath] = await Promise.all([
        uploadImage(beforeImage, "before"),
        uploadImage(afterImage, "after"),
      ]);
    }

    // ── Insert log row ────────────────────────────────────────────────────────
    const { error } = await supabase.from("analysis_logs").insert({
      employee_id: employeeId,
      employee_name: employeeName,
      department: department,
      office_name: officeName ?? null,
      // Store storage paths instead of raw Base64 (saves DB space)
      before_image: beforeImagePath ?? beforeImage?.slice(0, 500) ?? null,
      after_image: afterImagePath ?? afterImage?.slice(0, 500) ?? null,
      before_image_path: beforeImagePath,
      after_image_path: afterImagePath,
      analysis_result: analysisResult,
      scoring_method: scoringMethod ?? "gemini-fallback",
      cv_metrics: cvMetrics ?? null,
      // Geo audit trail
      before_latitude: beforeGeo?.latitude ?? null,
      before_longitude: beforeGeo?.longitude ?? null,
      before_captured_at: beforeGeo?.capturedAt ?? null,
      after_latitude: afterGeo?.latitude ?? null,
      after_longitude: afterGeo?.longitude ?? null,
      after_captured_at: afterGeo?.capturedAt ?? null,
      captured_at: capturedAt ?? null,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        beforeImagePath,
        afterImagePath,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Save analysis log error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to save analysis log" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
