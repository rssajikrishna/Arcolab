import { useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ImageUploader, { GeoMeta } from "@/components/ImageUploader";
import AnalysisResults, { AnalysisData } from "@/components/AnalysisResults";
import { Loader2, Sparkles, User, BadgeCheck, Building2, MapPin, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import arcolabLogoSrc from "@/assets/arcolab-logo.png";

// Resize and compress image to a max dimension to speed up AI analysis
const resizeImage = (base64: string, maxDim = 1024): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      canvas.getContext("2d")!.drawImage(img, 0, 0, cw, ch);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = base64;
  });
};

// Loads Arcolab logo as an Image element (cached after first load)
let cachedLogo: HTMLImageElement | null = null;
const loadArcolabLogo = (): Promise<HTMLImageElement> => {
  if (cachedLogo) return Promise.resolve(cachedLogo);
  return new Promise((resolve) => {
    const logo = new Image();
    logo.onload = () => { cachedLogo = logo; resolve(logo); };
    logo.onerror = () => resolve(logo);
    logo.src = arcolabLogoSrc;
  });
};

// Bakes employee name + office + zone + date + time (+ geo) + Arcolab logo as a watermark onto the image via canvas
const applyWatermark = (raw: string, employeeName: string, employeeId: string, officeName: string, zoneName?: string | null): Promise<string> => {
  // Parse geo prefix if present: "__geo:lat,lng:address__<base64>"
  let geoLine: string | null = null;
  let base64 = raw;
  const geoMatch = raw.match(/^__geo:([-\d.]+),([-\d.]+):([^_]*)__(.+)$/s);
  if (geoMatch) {
    const lat = parseFloat(geoMatch[1]).toFixed(5);
    const lng = parseFloat(geoMatch[2]).toFixed(5);
    const addr = geoMatch[3];
    geoLine = addr ? `📍 ${addr}` : `📍 ${lat}, ${lng}`;
    base64 = geoMatch[4];
  }

  return new Promise((resolve) => {
    Promise.all([loadArcolabLogo()]).then(([logo]) => {
      const img = new Image();
      img.onload = () => {
        const cw = img.naturalWidth;
        const ch = img.naturalHeight;

        const now = new Date();
        const day = String(now.getDate()).padStart(2, "0");
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = months[now.getMonth()];
        const year = now.getFullYear();
        const hours = String(now.getHours()).padStart(2, "0");
        const mins = String(now.getMinutes()).padStart(2, "0");
        const secs = String(now.getSeconds()).padStart(2, "0");
        const dateStr = `${day} ${month} ${year}`;
        const timeStr = `${hours}:${mins}:${secs}`;

        const fontSize = Math.max(18, Math.min(32, Math.round(cw / 25)));
        const padding = Math.round(fontSize * 0.9);

        const lines: string[] = [
          `${employeeName}  |  ID: ${employeeId}`,
          `Office: ${officeName}${zoneName ? `  |  Zone: ${zoneName}` : ""}`,
          `${dateStr}  ${timeStr}`,
        ];
        if (geoLine) lines.push(geoLine);

        const logoH = Math.round(fontSize * 2.5);
        const logoW = logo.naturalWidth ? Math.round((logo.naturalWidth / logo.naturalHeight) * logoH) : logoH;
        const lineH = fontSize * 1.9;
        const stripH = padding + logoH + padding * 0.8 + lineH * lines.length + padding;

        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch + stripH;
        const ctx = canvas.getContext("2d")!;

        ctx.drawImage(img, 0, 0, cw, ch);

        const stripY = ch;
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, stripY, cw, stripH);

        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        if (logo.naturalWidth) {
          const logoX = Math.round((cw - logoW) / 2);
          const logoY = stripY + padding;
          ctx.drawImage(logo, logoX, logoY, logoW, logoH);
        }

        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        const textStartY = stripY + padding + logoH + padding * 0.5;
        lines.forEach((line, i) => {
          ctx.fillText(line, cw / 2, textStartY + lineH * (i + 0.5));
        });
        ctx.textAlign = "left";

        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.src = base64;
    });
  });
};

// Simple in-memory cache: key = fingerprint of compressed images → analysis result
const analysisCache = new Map<string, AnalysisData>();
const fingerprintImages = (before: string, after: string): string =>
  `${before.slice(-300)}__${after.slice(-300)}`;

const Analysis = () => {
  const [beforeImage, setBeforeImage] = useState<string | null>(null);
  const [afterImage, setAfterImage] = useState<string | null>(null);
  const [beforeGeo, setBeforeGeo] = useState<GeoMeta | null>(null);
  const [afterGeo, setAfterGeo] = useState<GeoMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnalysisData | null>(null);
  const [analysisTimestamp, setAnalysisTimestamp] = useState<string | null>(null);
  const [beforeUploadTime, setBeforeUploadTime] = useState<string | null>(null);
  const [afterUploadTime, setAfterUploadTime] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const { toast } = useToast();
  const { employee, office } = useAuth();
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const ZONES = ["Production", "Warehouse", "Quality Control", "Packaging", "Office Area", "Maintenance"];

  const officeName = office?.name ?? "Unknown Office";

  const handleGeoDenied = useCallback(() => {
    setGeoError("Location access is required for 5S audit compliance. Please enable location permissions and try again.");
  }, []);

  const handleBeforeImage = useCallback(async (img: string | null, geo?: GeoMeta | null) => {
    if (!img) {
      setBeforeImage(null);
      setBeforeUploadTime(null);
      setBeforeGeo(null);
      return;
    }
    // Check mandatory geotag for camera images (legacy sentinel)
    if (img.startsWith("__geo_denied__")) {
      setGeoError("Location access required for analysis. Please enable location and try again.");
      return;
    }
    setGeoError(null);
    setBeforeUploadTime(geo?.capturedAt ?? new Date().toISOString());
    if (geo) setBeforeGeo(geo);
    const watermarked = await applyWatermark(img, employee?.name ?? "Employee", employee?.employeeId ?? "", officeName, selectedZone);
    setBeforeImage(watermarked);
  }, [employee, officeName, selectedZone]);

  const handleAfterImage = useCallback(async (img: string | null, geo?: GeoMeta | null) => {
    if (!img) {
      setAfterImage(null);
      setAfterUploadTime(null);
      setAfterGeo(null);
      return;
    }
    if (img.startsWith("__geo_denied__")) {
      setGeoError("Location access required for analysis. Please enable location and try again.");
      return;
    }
    setGeoError(null);
    setAfterUploadTime(geo?.capturedAt ?? new Date().toISOString());
    if (geo) setAfterGeo(geo);
    const watermarked = await applyWatermark(img, employee?.name ?? "Employee", employee?.employeeId ?? "", officeName, selectedZone);
    setAfterImage(watermarked);
  }, [employee, officeName, selectedZone]);

  const runAnalysis = async () => {
    if (!beforeImage || !afterImage) {
      toast({ title: "Please upload both images", description: "Upload a before and after image to run the analysis.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const [compBefore, compAfter] = await Promise.all([
        resizeImage(beforeImage, 1024),
        resizeImage(afterImage, 1024),
      ]);

      const cacheKey = fingerprintImages(compBefore, compAfter);
      const cached = analysisCache.get(cacheKey);
      if (cached) {
        setResults(cached as AnalysisData);
        setAnalysisTimestamp(new Date().toISOString());
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("analyze-5s", {
        body: { beforeImage: compBefore, afterImage: compAfter },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      analysisCache.set(cacheKey, data);

      setResults(data as AnalysisData);
      const ts = new Date().toISOString();
      setAnalysisTimestamp(ts);

      // Save analysis log with geo metadata (fire-and-forget)
      if (employee) {
        supabase.functions.invoke("save-analysis-log", {
          body: {
            employeeId: employee.employeeId,
            employeeName: employee.name,
            department: employee.department,
            officeName,
            beforeImage: beforeImage,
            afterImage: afterImage,
            analysisResult: data,
            scoringMethod: data?.scoringMethod ?? "gemini-fallback",
            cvMetrics: data?.beforeMetrics && data?.afterMetrics
              ? { before: data.beforeMetrics, after: data.afterMetrics }
              : null,
            // Geo metadata for audit trail
            beforeGeo: beforeGeo ?? null,
            afterGeo: afterGeo ?? null,
            capturedAt: ts,
          },
        }).catch((logErr) => {
          console.error("Failed to save analysis log:", logErr);
        });
      }
    } catch (err: unknown) {
      console.error("Analysis error:", err);
      toast({
        title: "Analysis Failed",
        description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Disable Run button if location has been denied and there are no images already attached
  const isGeoDenied = !!geoError && !beforeImage && !afterImage;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 section-padding bg-background">
        <div className="container-max">
          <div className="max-w-4xl mx-auto">
            {/* Employee + Office Card */}
            {employee && (
              <div className="bg-card rounded-xl border border-border p-5 mb-8">
                <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-semibold">Session Info</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-heading font-bold text-foreground">{employee.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <BadgeCheck className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>ID: <span className="font-medium text-foreground">{employee.employeeId}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>Dept: <span className="font-medium text-foreground">{employee.department}</span></span>
                      </div>
                    </div>
                  </div>
                  {office && (
                    <div className="flex items-start gap-3 sm:border-l sm:border-border sm:pl-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Selected Office</p>
                        <p className="text-sm font-semibold text-foreground leading-snug">{office.name}</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-start gap-3 sm:border-l sm:border-border sm:pl-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-start gap-3 text-left w-full hover:opacity-80 outline-none transition-opacity">
                          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <MapPin className="h-5 w-5 text-primary" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Select Zone</p>
                            <p className="text-sm font-semibold text-foreground leading-snug">
                              {selectedZone || "Choose a zone..."}
                            </p>
                          </div>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[200px]">
                        {ZONES.map((zone) => (
                          <DropdownMenuItem key={zone} onClick={() => setSelectedZone(zone)}>
                            {zone}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            )}

            <div className="text-center mb-10">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold text-foreground mb-3">
                5S Workplace Analysis
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Upload before and after images of your workspace. Location is required for geotagging
                and audit compliance.
              </p>
            </div>

            {/* Geo error banner */}
            {geoError && (
              <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-6">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-destructive">Location Access Required</p>
                  <p className="text-xs text-destructive/80 mt-0.5">{geoError}</p>
                </div>
              </div>
            )}

            {/* Geotag info banner */}
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 mb-6">
              <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">GPS geotagging is active.</span> Location, name, office, date and time will be stamped on each image.
              </p>
            </div>

            {/* Upload section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              <ImageUploader
                label="Before"
                sublabel="Before Image"
                variant="before"
                image={beforeImage}
                onImageChange={handleBeforeImage}
                timestamp={beforeUploadTime}
                employeeName={employee?.name ?? "Employee"}
                officeName={officeName}
                zoneName={selectedZone || "Unspecified Zone"}
                onGeoDenied={handleGeoDenied}
              />
              <ImageUploader
                label="After"
                sublabel="After Image"
                variant="after"
                image={afterImage}
                onImageChange={handleAfterImage}
                timestamp={afterUploadTime}
                employeeName={employee?.name ?? "Employee"}
                officeName={officeName}
                zoneName={selectedZone || "Unspecified Zone"}
                onGeoDenied={handleGeoDenied}
              />
            </div>

            {/* Run button — disabled if geo denied and no images yet */}
            <button
              onClick={runAnalysis}
              disabled={loading || !beforeImage || !afterImage || isGeoDenied}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed mb-10"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Analyzing workspace...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Run 5S Analysis
                </>
              )}
            </button>

            {/* Results */}
            {results && beforeImage && afterImage && (
              <AnalysisResults
                data={results}
                beforeImage={beforeImage}
                afterImage={afterImage}
                analysisTimestamp={analysisTimestamp || undefined}
                beforeUploadTime={beforeUploadTime || undefined}
                afterUploadTime={afterUploadTime || undefined}
              />
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Analysis;
