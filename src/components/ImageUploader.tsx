import { useCallback, useState, useRef } from "react";
import { Upload, X, Camera, MapPin, AlertTriangle } from "lucide-react";

interface ImageUploaderProps {
  label: string;
  sublabel: string;
  variant: "before" | "after";
  image: string | null;
  onImageChange: (base64: string | null) => void;
  timestamp?: string | null;
}

// Reverse geocode lat/lng to a readable address
const reverseGeocode = async (lat: string, lng: string): Promise<string> => {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await resp.json();
    if (data?.display_name) {
      // Shorten to city / state level
      const parts = data.display_name.split(",").map((s: string) => s.trim());
      return parts.slice(0, 3).join(", ");
    }
  } catch {
    // fall back to coords
  }
  return `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`;
};

const ImageUploader = ({ label, sublabel, variant, image, onImageChange }: ImageUploaderProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"idle" | "fetching" | "denied">("idle");
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        onImageChange(e.target?.result as string);
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

  const handleCameraWithGeo = useCallback(() => {
    setGeoStatus("fetching");
    if (!navigator.geolocation) {
      setGeoStatus("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGeoStatus("idle");
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        // Reverse geocode while waiting for user to take photo
        const address = await reverseGeocode(lat, lng);
        if (cameraInputRef.current) {
          cameraInputRef.current.dataset.lat = lat;
          cameraInputRef.current.dataset.lng = lng;
          cameraInputRef.current.dataset.addr = address;
        }
        cameraInputRef.current?.click();
      },
      () => {
        setGeoStatus("denied");
        // Don't open camera — location is mandatory
      },
      { timeout: 10000 }
    );
  }, []);

  const handleCameraInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const lat = e.target.dataset.lat;
      const lng = e.target.dataset.lng;
      const addr = e.target.dataset.addr || "";
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        if (lat && lng) {
          // Format: __geo:lat,lng:address__<base64>
          onImageChange(`__geo:${lat},${lng}:${addr}__${base64}`);
        } else {
          onImageChange(base64);
        }
      };
      reader.readAsDataURL(file);
      e.target.dataset.lat = "";
      e.target.dataset.lng = "";
      e.target.dataset.addr = "";
    },
    [onImageChange]
  );

  const borderColor = variant === "before" ? "border-destructive/30" : "border-primary/30";
  const hoverBorder = variant === "before" ? "hover:border-destructive/50" : "hover:border-primary/50";
  const tagBg = variant === "before" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${tagBg}`}>
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{sublabel}</span>
      </div>

      {image ? (
        <div className="relative rounded-xl overflow-hidden border border-border group">
          <img
            src={image.startsWith("__geo:") ? image.replace(/^__geo:[^_]*__/, "") : image}
            alt={label}
            className="w-full h-auto max-h-[400px] object-contain bg-black/5"
          />
          <button
            onClick={() => onImageChange(null)}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-foreground/70 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Remove image"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Camera capture (hidden input) */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraInputChange}
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

          {/* Camera button with geo */}
          <button
            type="button"
            onClick={handleCameraWithGeo}
            disabled={geoStatus === "fetching"}
            className={`w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 cursor-pointer transition-colors ${borderColor} ${hoverBorder} bg-muted/50 disabled:opacity-60`}
          >
            {geoStatus === "fetching" ? (
              <>
                <MapPin className="h-5 w-5 text-primary animate-pulse" />
                <span className="text-sm font-medium text-foreground">Getting location...</span>
              </>
            ) : (
              <>
                <Camera className="h-5 w-5 text-muted-foreground" />
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Take Photo with Geotag</span>
              </>
            )}
          </button>

          {/* Location denied error */}
          {geoStatus === "denied" && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-xs text-destructive leading-relaxed">
                Location access required for analysis. Please enable location permissions in your browser or device settings, then try again.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
