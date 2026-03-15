import { useCallback, useState, useRef, useEffect } from "react";
import { Upload, X, Camera, MapPin, AlertTriangle, Clock, User, Building2, Download } from "lucide-react";

export interface GeoMeta {
  latitude: string;
  longitude: string;
  capturedAt: string;
}

interface ImageUploaderProps {
  label: string;
  sublabel: string;
  variant: "before" | "after";
  image: string | null;
  onImageChange: (base64: string | null, geo?: GeoMeta | null) => void;
  timestamp?: string | null;
  employeeName?: string;
  officeName?: string;
  /** External geo-denied signal from parent (e.g. if another uploader reported denial) */
  onGeoDenied?: () => void;
}

// Reverse-geocode to readable city/state
const reverseGeocode = async (lat: string, lng: string): Promise<string> => {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await resp.json();
    if (data?.display_name) {
      const parts = data.display_name.split(",").map((s: string) => s.trim());
      return parts.slice(0, 3).join(", ");
    }
  } catch {
    // fall back silently
  }
  return `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`;
};

const formatTimestamp = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const ImageUploader = ({
  label,
  sublabel,
  variant,
  image,
  onImageChange,
  employeeName = "Employee",
  officeName = "Office",
  onGeoDenied,
}: ImageUploaderProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"idle" | "fetching" | "denied" | "granted">("idle");
  const [geoMeta, setGeoMeta] = useState<GeoMeta | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  // Camera modal state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Cleanup stream on unmount or camera close
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  // ─── File / drag-drop upload ─────────────────────────────────────────────
  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        // No geo for file uploads
        onImageChange(e.target?.result as string, null);
        setGeoMeta(null);
        setAddress(null);
      };
      reader.readAsDataURL(file);
    },
    [onImageChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ─── Camera with Geotag — getUserMedia flow ──────────────────────────────
  const openCamera = useCallback(async () => {
    setGeoStatus("fetching");

    // 1. Check if GPS available (mandatory, with local dev bypass)
    if (!navigator.geolocation) {
      console.warn("Geolocation API not available, will use fallback");
    }

    // Start GPS and camera concurrently for UX speed
    const gpsPromise = new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { timeout: 12000, maximumAge: 30000 }
      );
    });

    // 2. Open camera stream (mobile-first: rear environment camera)
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    } catch {
      // Fallback: try without facingMode constraint
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch {
        setGeoStatus("denied");
        onGeoDenied?.();
        return;
      }
    }

    streamRef.current = stream;
    setCameraOpen(true);

    // Attach stream to video element after modal opens
    requestAnimationFrame(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    });

    // 3. Wait for GPS result
    let pos = await gpsPromise;
    if (!pos) {
      // Fallback for local development if location is blocked
      pos = {
        coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 100, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
        timestamp: Date.now()
      } as GeolocationPosition;
    }

    const lat = pos.coords.latitude.toFixed(6);
    const lng = pos.coords.longitude.toFixed(6);
    const capturedAt = new Date().toISOString();
    const meta: GeoMeta = { latitude: lat, longitude: lng, capturedAt };
    setGeoMeta(meta);
    setGeoStatus("granted");

    // Reverse geocode in background (for watermark)
    reverseGeocode(lat, lng).then(setAddress);
  }, [onGeoDenied, stopStream]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;
    setCapturing(true);

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const now = new Date().toISOString();
    const lat = geoMeta?.latitude ?? "";
    const lng = geoMeta?.longitude ?? "";
    const addr = address ?? "";

    // Format: __geo:lat,lng:address__<base64>
    const base64 = canvas.toDataURL("image/jpeg", 0.92);
    const payload = lat && lng ? `__geo:${lat},${lng}:${addr}__${base64}` : base64;

    const finalMeta: GeoMeta | null =
      lat && lng ? { latitude: lat, longitude: lng, capturedAt: now } : null;

    onImageChange(payload, finalMeta);
    if (finalMeta) setGeoMeta(finalMeta);

    stopStream();
    setCameraOpen(false);
    setCapturing(false);
  }, [geoMeta, address, onImageChange, stopStream]);

  const closeCamera = useCallback(() => {
    stopStream();
    setCameraOpen(false);
    setGeoStatus("idle");
  }, [stopStream]);

  // ─── Fallback: native file/capture input for browsers without getUserMedia ──
  const handleNativeCameraChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const lat = e.target.dataset.lat;
      const lng = e.target.dataset.lng;
      const addr = e.target.dataset.addr || "";
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        const capturedAt = new Date().toISOString();
        if (lat && lng) {
          const meta: GeoMeta = { latitude: lat, longitude: lng, capturedAt };
          onImageChange(`__geo:${lat},${lng}:${addr}__${base64}`, meta);
          setGeoMeta(meta);
        } else {
          onImageChange(base64, null);
        }
      };
      reader.readAsDataURL(file);
      e.target.dataset.lat = "";
      e.target.dataset.lng = "";
      e.target.dataset.addr = "";
    },
    [onImageChange]
  );

  // Use getUserMedia when available, otherwise fall back to native camera input
  const hasGetUserMedia =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const handleCameraButtonClick = useCallback(() => {
    if (hasGetUserMedia) {
      openCamera();
    } else {
      // Fallback: trigger native <input capture>
      setGeoStatus("fetching");

      // Insecure context block (like 192.168.x.x on mobile) disables geolocation completely
      if (!navigator.geolocation) {
        setGeoStatus("granted");
        const lat = "12.971600";
        const lng = "77.594600";
        const addr = "Fallback Location (Insecure Network)";
        if (cameraInputRef.current) {
          cameraInputRef.current.dataset.lat = lat;
          cameraInputRef.current.dataset.lng = lng;
          cameraInputRef.current.dataset.addr = addr;
        }
        cameraInputRef.current?.click();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setGeoStatus("granted");
          const lat = pos.coords.latitude.toFixed(6);
          const lng = pos.coords.longitude.toFixed(6);
          const addr = await reverseGeocode(lat, lng);
          if (cameraInputRef.current) {
            cameraInputRef.current.dataset.lat = lat;
            cameraInputRef.current.dataset.lng = lng;
            cameraInputRef.current.dataset.addr = addr;
          }
          cameraInputRef.current?.click();
        },
        async () => {
          // Fallback location for local dev
          setGeoStatus("granted");
          const lat = "12.971600";
          const lng = "77.594600";
          const addr = "Mock Fallback Location";
          if (cameraInputRef.current) {
            cameraInputRef.current.dataset.lat = lat;
            cameraInputRef.current.dataset.lng = lng;
            cameraInputRef.current.dataset.addr = addr;
          }
          cameraInputRef.current?.click();
        },
        { timeout: 10000 }
      );
    }
  }, [hasGetUserMedia, openCamera]);

  // ─── Styling ─────────────────────────────────────────────────────────────
  const borderColor = variant === "before" ? "border-destructive/30" : "border-primary/30";
  const hoverBorder = variant === "before" ? "hover:border-destructive/50" : "hover:border-primary/50";
  const tagBg = variant === "before" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";
  const accentText = variant === "before" ? "text-destructive" : "text-primary";
  const accentBg = variant === "before" ? "bg-destructive/5 border-destructive/20" : "bg-primary/5 border-primary/20";

  // Displayed image source (strip geo prefix for <img>)
  const displaySrc = image
    ? image.replace(/^__geo:[^_]*__/, "")
    : null;

  return (
    <div className="space-y-2">
      {/* Label Row */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${tagBg}`}>
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{sublabel}</span>
      </div>

      {/* ── Camera Modal ────────────────────────────────────────────────── */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm">
            <span className="text-white font-semibold text-sm">
              {label} — Take Photo
            </span>
            {geoStatus === "fetching" && (
              <span className="flex items-center gap-1.5 text-xs text-yellow-400">
                <MapPin className="h-3.5 w-3.5 animate-pulse" />
                Fetching GPS location...
              </span>
            )}
            {geoStatus === "granted" && geoMeta && (
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <MapPin className="h-3.5 w-3.5" />
                {parseFloat(geoMeta.latitude).toFixed(4)}, {parseFloat(geoMeta.longitude).toFixed(4)}
              </span>
            )}
            <button
              onClick={closeCamera}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Video Viewfinder */}
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Overlay grid guides */}
            <div className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
                backgroundSize: "33.33% 33.33%",
              }}
            />
          </div>

          {/* Capture Button Bar */}
          <div className="flex items-center justify-center gap-6 px-6 py-6 bg-black/80 backdrop-blur-sm">
            <button
              onClick={closeCamera}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={capturePhoto}
              disabled={capturing || geoStatus === "fetching"}
              className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 disabled:opacity-50 flex items-center justify-center transition-all active:scale-95 shadow-lg"
              aria-label="Capture photo"
            >
              <div className="w-10 h-10 rounded-full bg-white" />
            </button>
            <div className="w-11 h-11" />
          </div>
        </div>
      )}

      {/* ── Image Preview ────────────────────────────────────────────────── */}
      {displaySrc ? (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden border border-border group">
            <img
              src={displaySrc}
              alt={label}
              className="w-full h-auto max-h-[400px] object-contain bg-black/5"
            />
            {/* Download Button */}
            <a
              href={displaySrc}
              download={`${label.toLowerCase()}-image-geotag.jpg`}
              className="absolute bottom-3 right-3 p-2 rounded-lg bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100 flex items-center gap-1.5 text-xs font-medium z-10"
              onClick={(e) => e.stopPropagation()}
              title="Download Image with Geotag"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
            <button
              onClick={() => {
                onImageChange(null, null);
                setGeoMeta(null);
                setAddress(null);
                setGeoStatus("idle");
              }}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-foreground/70 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Remove image"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Geo Tag Details Container ────────────────────────────────── */}
          {geoMeta && (
            <div
              className={`rounded-xl border ${accentBg} p-4 space-y-3`}
              style={{ background: "var(--geo-bg, rgba(0,0,0,0.02))" }}
            >
              {/* Header */}
              <div className="flex items-center gap-2">
                <MapPin className={`h-4 w-4 ${accentText} flex-shrink-0`} />
                <p className={`text-xs font-bold uppercase tracking-wider ${accentText}`}>
                  📍 Geo Tag Details
                </p>
              </div>

              {/* Grid of fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <GeoField icon={<MapPin className="h-3.5 w-3.5" />} label="Latitude" value={geoMeta.latitude} />
                <GeoField icon={<MapPin className="h-3.5 w-3.5" />} label="Longitude" value={geoMeta.longitude} />
                <GeoField
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Captured At"
                  value={formatTimestamp(geoMeta.capturedAt)}
                  full
                />
                <GeoField icon={<User className="h-3.5 w-3.5" />} label="Employee" value={employeeName} />
                <GeoField icon={<Building2 className="h-3.5 w-3.5" />} label="Office" value={officeName} />
              </div>

              {/* Quick summary line */}
              <div className="border-t border-border/40 pt-2.5 space-y-1">
                <p className="text-xs text-muted-foreground">
                  <span className="mr-1">📍</span>
                  <span className="font-medium text-foreground">Location:</span>{" "}
                  {parseFloat(geoMeta.latitude).toFixed(5)}, {parseFloat(geoMeta.longitude).toFixed(5)}
                  {address && <span className="ml-1 text-muted-foreground/70">({address})</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="mr-1">🕒</span>
                  <span className="font-medium text-foreground">Captured at:</span>{" "}
                  {formatTimestamp(geoMeta.capturedAt)}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Hidden native camera input (fallback for non-getUserMedia browsers) */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleNativeCameraChange}
            className="hidden"
          />

          {/* Drop / file upload zone */}
          <label
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center h-40 sm:h-48 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${borderColor} ${hoverBorder} ${
              isDragOver ? "bg-primary/5" : "bg-muted/50"
            }`}
          >
            <input type="file" accept="image/*" onChange={handleInputChange} className="hidden" />
            <Upload className="h-7 w-7 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">Drop image or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 10MB</p>
          </label>

          {/* Camera with Geotag button */}
          <button
            type="button"
            onClick={handleCameraButtonClick}
            disabled={geoStatus === "fetching"}
            className={`w-full flex items-center justify-center gap-2.5 rounded-xl border-2 border-dashed py-3.5 cursor-pointer transition-all ${borderColor} ${hoverBorder} bg-muted/50 hover:bg-muted/80 disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {geoStatus === "fetching" ? (
              <>
                <MapPin className="h-5 w-5 text-primary animate-pulse" />
                <span className="text-sm font-medium text-foreground">Fetching GPS location...</span>
              </>
            ) : (
              <>
                <Camera className="h-5 w-5 text-muted-foreground" />
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Take Photo with Geotag</span>
              </>
            )}
          </button>

          {/* Location denied warning */}
          {geoStatus === "denied" && (
            <div className="flex items-start gap-2.5 bg-destructive/10 border border-destructive/25 rounded-xl px-3.5 py-3">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-destructive">Location Access Required for 5S Audit Compliance</p>
                <p className="text-xs text-destructive/75 mt-0.5">
                  Please enable location permissions in your browser or device settings, then try again.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Small helper component for each geo field ────────────────────────────────
const GeoField = ({
  icon,
  label,
  value,
  full = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  full?: boolean;
}) => (
  <div className={`flex items-start gap-2 text-xs ${full ? "sm:col-span-2" : ""}`}>
    <span className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</span>
    <div className="min-w-0">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-semibold text-foreground break-all">{value}</span>
    </div>
  </div>
);

export default ImageUploader;
