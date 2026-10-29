"use client";

import { useEffect, useRef, useState } from "react";

interface DetectedCode {
  rawValue: string;
}

interface QrDetector {
  detect(source: HTMLVideoElement): Promise<DetectedCode[]>;
}

type WindowWithQrDetector = Window & {
  BarcodeDetector?: new (options: { formats: string[] }) => QrDetector;
};

export function QrCameraScanner({
  onScan,
}: {
  onScan: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let stream: MediaStream | null = null;
    let videoElement: HTMLVideoElement | null = null;
    let interval = 0;
    const Detector = (window as WindowWithQrDetector).BarcodeDetector;

    if (!Detector) {
      return;
    }

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        videoElement = videoRef.current;
        if (disposed || !videoElement) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        videoElement.srcObject = stream;
        await videoElement.play();
        const detector = new Detector({ formats: ["qr_code"] });
        interval = window.setInterval(async () => {
          if (disposed || !videoElement || videoElement.readyState < 2) return;
          try {
            const codes = await detector.detect(videoElement);
            if (disposed) return;
            const value = codes[0]?.rawValue.trim();
            if (value) {
              disposed = true;
              setActive(false);
              onScan(value);
            }
          } catch (reason) {
            console.error("Could not read the QR code from the camera.", reason);
            setError("Could not read the QR code. Check camera permission and try again.");
            setActive(false);
          }
        }, 500);
      } catch (reason) {
        console.error("Could not start the QR scanner camera.", reason);
        setError("Camera access is unavailable. Allow camera permission or use a secure HTTPS page.");
        setActive(false);
      }
    };
    void start();

    return () => {
      disposed = true;
      window.clearInterval(interval);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) videoElement.srcObject = null;
    };
  }, [active, onScan]);

  return (
    <div className="space-y-3">
      {active ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
          <video ref={videoRef} className="aspect-video w-full object-cover" playsInline muted aria-label="Camera QR scanner" />
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
      <button
        type="button"
        onClick={() => {
          setError("");
          if (!active && !(window as WindowWithQrDetector).BarcodeDetector) {
            setError("QR scanning is not supported by this browser. Use a recent Chrome-based browser.");
            return;
          }
          setActive((value) => !value);
        }}
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
      >
        {active ? "Stop QR scanner" : "Scan member QR"}
      </button>
    </div>
  );
}
