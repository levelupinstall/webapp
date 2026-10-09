"use client";

import { useState } from "react";
import { lu } from "@/lib/level-up-ui";

export function ScanUpload({ onDimensions }: { onDimensions: (dims: unknown) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/planner/scan-dimensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not read dimensions from the scan.");
      if (!d.dimensions) throw new Error("No readable dimensions found — try a clearer floor plan export.");
      setResult(
        `Found ${d.dimensions.wallLengthsIn.length} walls` +
          (d.dimensions.ceilingHeightIn ? `, ${d.dimensions.ceilingHeightIn}" ceilings` : "") +
          ". These measurements now replace the estimates in your design.",
      );
      onDimensions(d.dimensions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={lu.panel}>
      <h2 className={lu.heading}>Scan your room for exact measurements</h2>
      <p className={`mt-2 text-[15px] ${lu.body}`}>
        Film a slow walkthrough of your room with the free{" "}
        <strong>Polycam</strong> app (iPhone or Android), then export the floor plan
        and upload it here. We&apos;ll pull the real wall measurements into your
        design — no guessing, no site visit needed for an accurate quote.
      </p>
      <ol className={`mt-3 list-decimal pl-5 text-[14px] ${lu.body} space-y-1`}>
        <li>Install Polycam (free) and choose &quot;Room&quot; mode</li>
        <li>Walk slowly around the room, phone at chest height</li>
        <li>Export the floor plan as an image</li>
        <li>Upload it below</li>
      </ol>
      <label className={`${lu.btnSecondary} mt-4 inline-block cursor-pointer`}>
        {uploading ? "Reading scan…" : "Upload floor plan"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>
      {error && <p className="mt-3 text-[14px] text-red-600">{error}</p>}
      {result && <p className="mt-3 text-[14px] text-green-700">{result}</p>}
    </div>
  );
}
