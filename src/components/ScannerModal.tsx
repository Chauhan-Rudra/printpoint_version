import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Flashlight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  CameraOff,
  QrCode,
  Zap,
} from 'lucide-react';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { Haptics } from '../utils/haptics';
import { validateKioskQrCode } from '../utils/kioskQrValidator';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFromGallery?: () => void;
  onCaptureDocument?: () => void;
  onKioskConnected?: (kioskName: string) => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  onKioskConnected,
}) => {
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanWarning, setScanWarning] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [detectedKiosk, setDetectedKiosk] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop camera tracks and release scanner controls
  const stopCameraAndScanner = useCallback(() => {
    isScanningRef.current = false;

    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // ignore
      }
      controlsRef.current = null;
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setTorchOn(false);
  }, []);

  // Handle successful detection
  const handleSuccessfulDetection = useCallback((kioskName: string) => {
    if (!isScanningRef.current) return;
    isScanningRef.current = false;

    Haptics.success();
    setDetectedKiosk(kioskName);
    stopCameraAndScanner();

    // Brief pause to allow the user to see the success card before transitioning
    setTimeout(() => {
      if (onKioskConnected) {
        onKioskConnected(kioskName);
      }
    }, 700);
  }, [onKioskConnected, stopCameraAndScanner]);

  // Start camera and real-time QR scanning
  const startCameraAndScanner = useCallback(async () => {
    setErrorMessage(null);
    setScanWarning(null);
    setDetectedKiosk(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setHasCameraPermission(false);
      setErrorMessage('Camera access is not supported by this browser.');
      return;
    }

    try {
      const codeReader = new BrowserQRCodeReader();
      isScanningRef.current = true;

      // Start video stream with rear environment camera
      const controls = await codeReader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
          audio: false,
        },
        videoRef.current!,
        (result, error) => {
          if (!isScanningRef.current) return;

          if (result) {
            const rawText = result.getText();
            const validation = validateKioskQrCode(rawText);

            if (validation.valid && validation.kioskId) {
              handleSuccessfulDetection(validation.kioskId);
            } else {
              // Non-kiosk QR code detected: give brief feedback and continue scanning
              Haptics.error();
              setScanWarning(
                validation.error || 'Invalid QR code. Please scan the Creator4 Lab Kiosk screen.'
              );
              setTimeout(() => setScanWarning(null), 3000);
            }
          }

          if (error && error.name !== 'NotFoundException') {
            // Normal frame without QR; ignore to avoid console noise
          }
        }
      );

      controlsRef.current = controls;
      setHasCameraPermission(true);

      // Check for hardware flashlight / torch capabilities
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
          if (capabilities && 'torch' in capabilities) {
            setTorchSupported(true);
          }
        }
      }
    } catch (err: unknown) {
      console.warn('Camera initialization error:', err);
      setHasCameraPermission(false);
      const isDenied =
        err instanceof Error &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');

      if (isDenied) {
        setErrorMessage('Camera permission was denied. Please allow camera access in browser settings.');
      } else {
        setErrorMessage('Unable to access camera. Please check camera connection and try again.');
      }
      isScanningRef.current = false;
    }
  }, [handleSuccessfulDetection]);

  // Toggle torch / flashlight
  const handleToggleTorch = async () => {
    if (!torchSupported || !streamRef.current) return;
    Haptics.buttonPress();

    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !torchOn;
        await track.applyConstraints({
          // @ts-expect-error W3C image capture standard
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch {
        setTorchOn(false);
      }
    }
  };

  // Direct manual fallback connection for demo / permission failure
  const handleDirectConnectKiosk04 = () => {
    Haptics.buttonPress();
    handleSuccessfulDetection('Kiosk #04');
  };

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        startCameraAndScanner();
      }, 60);
      return () => clearTimeout(timer);
    } else {
      stopCameraAndScanner();
    }

    return () => {
      stopCameraAndScanner();
    };
  }, [isOpen, startCameraAndScanner, stopCameraAndScanner]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan Kiosk QR"
      className="fixed inset-0 z-50 bg-black flex flex-col antialiased text-white overflow-hidden select-none"
    >
      {/* 1. Full-Screen Camera Video Stream */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* 2. Cinematic Vignette Mask with Transparent Center Cutout for the Viewfinder */}
      <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-between">
        {/* Top Dark Scrim */}
        <div className="w-full flex-1 bg-black/65 backdrop-blur-[2px]" />

        {/* Center Row containing Cutout Window */}
        <div className="w-full flex items-center justify-center shrink-0">
          <div className="flex-1 h-[270px] sm:h-[300px] bg-black/65 backdrop-blur-[2px]" />

          {/* Central Transparent Cutout Window */}
          <div className="relative w-[270px] sm:w-[300px] h-[270px] sm:h-[300px] rounded-3xl overflow-hidden shrink-0">
            {/* 4 Crisp Neon-Emerald Corner Brackets */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Top-Left */}
              <div className="absolute top-0 left-0 w-9 h-9 border-t-[4px] border-l-[4px] border-[#10B981] rounded-tl-2xl shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
              {/* Top-Right */}
              <div className="absolute top-0 right-0 w-9 h-9 border-t-[4px] border-r-[4px] border-[#10B981] rounded-tr-2xl shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
              {/* Bottom-Left */}
              <div className="absolute bottom-0 left-0 w-9 h-9 border-b-[4px] border-l-[4px] border-[#10B981] rounded-bl-2xl shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
              {/* Bottom-Right */}
              <div className="absolute bottom-0 right-0 w-9 h-9 border-b-[4px] border-r-[4px] border-[#10B981] rounded-br-2xl shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
            </div>

            {/* Subtle Crosshair Reticle Center Guide */}
            <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
              <div className="w-6 h-0.5 bg-emerald-400" />
              <div className="h-6 w-0.5 bg-emerald-400 absolute" />
            </div>

            {/* Animated Laser Scanning Beam */}
            {hasCameraPermission && !detectedKiosk && (
              <div className="absolute left-1.5 right-1.5 h-1 bg-gradient-to-r from-transparent via-[#34D399] to-transparent shadow-[0_0_14px_#34D399] animate-scanner-beam pointer-events-none" />
            )}
          </div>

          <div className="flex-1 h-[270px] sm:h-[300px] bg-black/65 backdrop-blur-[2px]" />
        </div>

        {/* Bottom Dark Scrim */}
        <div className="w-full flex-1 bg-black/65 backdrop-blur-[2px]" />
      </div>

      {/* 3. Floating Glassmorphic Top Header Bar */}
      <header className="relative z-20 w-full pt-safe px-4 pt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            Haptics.buttonPress();
            stopCameraAndScanner();
            onClose();
          }}
          aria-label="Back to home"
          className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 text-white border border-white/20 backdrop-blur-md flex items-center justify-center active:scale-90 transition-all shadow-lg"
        >
          <ArrowLeft className="w-5 h-5 stroke-[2.3]" />
        </button>

        {/* Center Station Status Pill */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/50 border border-white/20 backdrop-blur-md shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-white tracking-wide">
            Kiosk #04
          </span>
          <span className="text-white/40 text-[10px]">·</span>
          <span className="text-[11px] text-white/80 font-medium">
            Scan to Connect
          </span>
        </div>

        {/* Right Flashlight / Torch Action */}
        {torchSupported ? (
          <button
            type="button"
            onClick={handleToggleTorch}
            aria-label={torchOn ? 'Turn flashlight off' : 'Turn flashlight on'}
            className={`w-11 h-11 rounded-full backdrop-blur-md border border-white/20 flex items-center justify-center active:scale-90 transition-all shadow-lg ${
              torchOn
                ? 'bg-amber-400 text-slate-950 font-bold shadow-amber-400/30'
                : 'bg-black/45 text-white hover:bg-black/65'
            }`}
          >
            <Flashlight className="w-5 h-5 stroke-[2.2]" />
          </button>
        ) : (
          <div className="w-11 h-11 flex items-center justify-center rounded-full bg-black/30 border border-white/10 backdrop-blur-md text-white/50 text-xs font-bold">
            <QrCode className="w-4.5 h-4.5" />
          </div>
        )}
      </header>

      {/* 4. Guidance Instruction Pill Above Viewfinder */}
      <div className="relative z-20 w-full text-center px-6 mt-4">
        <h2 className="text-sm sm:text-[15px] font-bold text-white tracking-tight drop-shadow-md">
          Point camera at the kiosk screen
        </h2>
        <p className="text-xs text-white/70 mt-0.5 drop-shadow-sm font-medium">
          Align the square QR code inside the frame
        </p>
      </div>

      {/* 5. Camera Loading / Permission Fallback States */}
      {hasCameraPermission === null && (
        <div className="absolute inset-0 z-30 bg-black/85 flex flex-col items-center justify-center text-white/80 p-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center text-emerald-400 mb-4 animate-pulse">
            <RefreshCw className="w-8 h-8 animate-spin" />
          </div>
          <h3 className="text-base font-bold text-white">Starting Scanner Camera...</h3>
          <p className="text-xs text-white/60 mt-1 max-w-xs">
            Connecting to your device camera to read the kiosk QR code.
          </p>
        </div>
      )}

      {hasCameraPermission === false && (
        <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="w-full max-w-xs rounded-3xl bg-white/10 border border-white/20 p-6 backdrop-blur-xl shadow-2xl flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mb-3">
              <CameraOff className="w-7 h-7 stroke-[2.2]" />
            </div>
            <h3 className="text-base font-bold text-white">Camera Unavailable</h3>
            <p className="text-xs text-white/70 mt-1.5 mb-5 leading-relaxed">
              {errorMessage || 'Camera access is required to scan the kiosk screen QR code.'}
            </p>
            <div className="flex flex-col gap-2.5 w-full">
              <button
                type="button"
                onClick={startCameraAndScanner}
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Camera Again</span>
              </button>

              <button
                type="button"
                onClick={handleDirectConnectKiosk04}
                className="w-full h-11 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs border border-white/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>Quick Connect to Kiosk #04</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Success Overlay on QR Detection */}
      {detectedKiosk && (
        <div className="absolute inset-0 z-40 bg-[#1B4D2E]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-apple-card">
          <div className="w-18 h-18 rounded-3xl bg-white text-[#1B4D2E] flex items-center justify-center mb-4 shadow-xl animate-check-pop">
            <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
          </div>
          <h3 className="text-xl font-black text-white tracking-tight">
            {detectedKiosk} Connected!
          </h3>
          <p className="text-xs text-emerald-200 mt-1.5 font-medium">
            Session paired · Opening document upload...
          </p>
          <div className="mt-5 flex items-center gap-2 text-[11px] text-white/80 bg-white/10 px-3.5 py-1.5 rounded-full border border-white/15">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Ready to receive your print files</span>
          </div>
        </div>
      )}

      {/* 7. Bottom Action & Status Footer */}
      <footer className="relative z-20 w-full pb-safe px-6 pb-6 mt-auto flex flex-col items-center gap-3">
        {scanWarning ? (
          /* Non-Kiosk QR Warning Toast */
          <div
            role="alert"
            className="w-full max-w-xs p-3 rounded-2xl bg-amber-500/90 border border-amber-300 text-slate-950 text-xs font-semibold flex items-center gap-2.5 backdrop-blur-md shadow-xl animate-apple-card"
          >
            <AlertCircle className="w-4.5 h-4.5 text-slate-950 shrink-0" />
            <span className="leading-tight text-[11.5px]">{scanWarning}</span>
          </div>
        ) : (
          /* Sleek Status Pill */
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 border border-white/20 backdrop-blur-md shadow-xl text-xs font-semibold text-white/90">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              {hasCameraPermission ? 'Scanning for Creator4 Kiosk QR...' : 'Waiting for camera feed...'}
            </span>
          </div>
        )}

        {/* Quick Demo Connect Shortcut */}
        <button
          type="button"
          onClick={handleDirectConnectKiosk04}
          className="text-white/60 hover:text-white text-xs font-medium underline underline-offset-4 decoration-white/30 hover:decoration-white active:scale-95 transition-all mt-1"
        >
          Can't scan? Tap to connect Kiosk #04 directly
        </button>
      </footer>

      {/* Embedded CSS for the Scanning Laser Animation */}
      <style>{`
        @keyframes scannerBeam {
          0% {
            top: 2%;
            opacity: 0.3;
          }
          15% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            top: 98%;
            opacity: 0.3;
          }
        }
        .animate-scanner-beam {
          animation: scannerBeam 2.2s ease-in-out infinite alternate;
        }
      `}</style>
    </div>,
    document.body
  );
};
