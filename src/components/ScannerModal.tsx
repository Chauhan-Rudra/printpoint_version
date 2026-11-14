import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Flashlight,
  CheckCircle,
  WarningCircle,
  ArrowsClockwise,
  CameraSlash,
} from '@phosphor-icons/react';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { Haptics } from '../utils/haptics';
import { validateKioskQrCode } from '../utils/kioskQrValidator';
import {
  markSessionTokenUsed,
  validateAndPairQrWithBackend,
} from '../utils/kioskSession';
import { useTranslation } from '../utils/i18n';
import { Button } from './ui';
import { PP_EASE } from '../design-system/motion';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKioskConnected?: (kioskName: string) => void;
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  onKioskConnected,
}) => {
  const { t } = useTranslation();

  const [cameraState, setCameraState] = useState<
    'idle' | 'starting' | 'active' | 'error'
  >('idle');
  const [errorTitle, setErrorTitle] = useState<string>('Camera Unavailable');
  const [errorMessage, setErrorMessage] = useState<string>(
    'Unable to access camera.'
  );
  const [scanWarning, setScanWarning] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [connectedKiosk, setConnectedKiosk] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRafRef = useRef<number | null>(null);
  const warningTimerRef = useRef<number | null>(null);
  const navTimerRef = useRef<number | null>(null);

  const sessionNonceRef = useRef<number>(0);
  const isScanningRef = useRef<boolean>(false);
  const isValidatingRef = useRef<boolean>(false);
  const lastInvalidPayloadRef = useRef<{ text: string; at: number } | null>(null);

  const stopCameraAndScanner = useCallback(() => {
    isScanningRef.current = false;
    isValidatingRef.current = false;

    if (detectorRafRef.current !== null) {
      window.cancelAnimationFrame(detectorRafRef.current);
      detectorRafRef.current = null;
    }

    if (warningTimerRef.current !== null) {
      window.clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }

    if (navTimerRef.current !== null) {
      window.clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }

    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      zxingControlsRef.current = null;
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch {
        // Ignore track stop errors
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // Ignore pause errors
      }
      videoRef.current.srcObject = null;
    }

    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const handleDecodedPayload = useCallback(
    async (rawText: string) => {
      if (!isScanningRef.current || isValidatingRef.current) return;

      const cleanText = rawText.trim();
      if (!cleanText) return;

      // Debounce repeated frame reads of the exact same invalid QR code
      const lastInvalid = lastInvalidPayloadRef.current;
      if (
        lastInvalid &&
        lastInvalid.text === cleanText &&
        Date.now() - lastInvalid.at < 2000
      ) {
        return;
      }

      isValidatingRef.current = true;
      const validation = validateKioskQrCode(cleanText);

      if (!validation.valid || !validation.kioskId || !validation.sessionToken) {
        lastInvalidPayloadRef.current = { text: cleanText, at: Date.now() };
        isValidatingRef.current = false;
        Haptics.error();
        setScanWarning(
          validation.error ||
            'Invalid QR code. Scan the active QR code displayed on the Print Point kiosk.'
        );

        if (warningTimerRef.current !== null) {
          window.clearTimeout(warningTimerRef.current);
        }
        warningTimerRef.current = window.setTimeout(() => {
          setScanWarning(null);
          warningTimerRef.current = null;
        }, 3400);
        return;
      }

      const activeNonce = sessionNonceRef.current;
      const backendResult = await validateAndPairQrWithBackend(cleanText);
      if (sessionNonceRef.current !== activeNonce) {
        isValidatingRef.current = false;
        return;
      }

      if (backendResult.ok && backendResult.session) {
        isScanningRef.current = false;
        stopCameraAndScanner();

        markSessionTokenUsed(validation.sessionToken);
        Haptics.success();
        setScanWarning(null);
        setConnectedKiosk(backendResult.session.activeStation.name);

        navTimerRef.current = window.setTimeout(() => {
          navTimerRef.current = null;
          onKioskConnected?.(backendResult.session!.activeStation.name);
        }, 950);
        return;
      }

      lastInvalidPayloadRef.current = { text: cleanText, at: Date.now() };
      isValidatingRef.current = false;
      Haptics.error();
      setScanWarning(
        backendResult.error ||
          'Unable to verify kiosk session. Sign in and scan an active kiosk QR code.'
      );

      if (warningTimerRef.current !== null) {
        window.clearTimeout(warningTimerRef.current);
      }
      warningTimerRef.current = window.setTimeout(() => {
        setScanWarning(null);
        warningTimerRef.current = null;
      }, 3800);
    },
    [onKioskConnected, stopCameraAndScanner]
  );

  const startCameraAndScanner = useCallback(async () => {
    const currentNonce = ++sessionNonceRef.current;
    stopCameraAndScanner();

    setScanWarning(null);
    setConnectedKiosk(null);
    setCameraState('starting');
    lastInvalidPayloadRef.current = null;

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setCameraState('error');
      setErrorTitle('Camera Unsupported');
      setErrorMessage(
        'This browser does not support camera scanning, or HTTPS is required.'
      );
      return;
    }

    let acquiredStream: MediaStream | null = null;

    try {
      acquiredStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
        },
        audio: false,
      });

      // Guard if user closed scanner or restarted while awaiting permission
      if (sessionNonceRef.current !== currentNonce || !videoRef.current) {
        acquiredStream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = acquiredStream;
      const videoEl = videoRef.current;
      videoEl.srcObject = acquiredStream;

      try {
        await videoEl.play();
      } catch {
        // Mobile Safari may emit harmless AbortError if stream restarts
      }

      if (sessionNonceRef.current !== currentNonce) {
        stopCameraAndScanner();
        return;
      }

      const primaryTrack = acquiredStream.getVideoTracks()[0];
      if (primaryTrack) {
        const capabilities = primaryTrack.getCapabilities?.() as
          | { torch?: boolean }
          | undefined;
        if (capabilities && capabilities.torch) {
          setTorchSupported(true);
        }
      }

      setCameraState('active');
      isScanningRef.current = true;

      // Prefer native BarcodeDetector when available & supports qr_code
      const DetectorCtor = (
        window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
      ).BarcodeDetector;

      let canUseNativeDetector = false;
      if (DetectorCtor) {
        try {
          if (typeof DetectorCtor.getSupportedFormats === 'function') {
            const formats = await DetectorCtor.getSupportedFormats();
            canUseNativeDetector = formats.includes('qr_code');
          } else {
            canUseNativeDetector = true;
          }
        } catch {
          canUseNativeDetector = false;
        }
      }

      if (sessionNonceRef.current !== currentNonce) {
        stopCameraAndScanner();
        return;
      }

      if (canUseNativeDetector && DetectorCtor) {
        const detector = new DetectorCtor({ formats: ['qr_code'] });
        let lastDetectAt = 0;

        const scanFrame = async (timestamp: number) => {
          if (
            !isScanningRef.current ||
            sessionNonceRef.current !== currentNonce ||
            !videoRef.current
          ) {
            return;
          }

          if (
            timestamp - lastDetectAt >= 120 &&
            videoRef.current.readyState >= 2 &&
            !isValidatingRef.current
          ) {
            lastDetectAt = timestamp;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0 && barcodes[0].rawValue) {
                handleDecodedPayload(barcodes[0].rawValue);
              }
            } catch {
              // Ignore single-frame detection failures
            }
          }

          if (isScanningRef.current && sessionNonceRef.current === currentNonce) {
            detectorRafRef.current = window.requestAnimationFrame(scanFrame);
          }
        };

        detectorRafRef.current = window.requestAnimationFrame(scanFrame);
        return;
      }

      // Universal fallback via @zxing/browser reusing our single active MediaStream
      const codeReader = new BrowserQRCodeReader();
      const controls = await codeReader.decodeFromStream(
        acquiredStream,
        videoEl,
        (result) => {
          if (!isScanningRef.current || sessionNonceRef.current !== currentNonce) {
            return;
          }
          if (result) {
            handleDecodedPayload(result.getText());
          }
        }
      );

      if (sessionNonceRef.current !== currentNonce) {
        try {
          controls.stop();
        } catch {
          // ignore
        }
        return;
      }

      zxingControlsRef.current = controls;
    } catch (err: unknown) {
      if (acquiredStream) {
        acquiredStream.getTracks().forEach((track) => track.stop());
      }
      if (sessionNonceRef.current !== currentNonce) return;

      stopCameraAndScanner();
      setCameraState('error');

      const errName = err instanceof Error ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setErrorTitle('Camera Permission Denied');
        setErrorMessage(
          'Allow camera access in your browser settings to scan the Print Point kiosk QR code.'
        );
      } else if (
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        errName === 'OverconstrainedError'
      ) {
        setErrorTitle('Camera Unavailable');
        setErrorMessage(
          'No rear or compatible camera was found on this device.'
        );
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setErrorTitle('Camera In Use');
        setErrorMessage(
          'Your camera is currently being used by another application. Close it and try again.'
        );
      } else {
        setErrorTitle('Camera Error');
        setErrorMessage(
          'Could not start the camera scanner. Check permissions and try again.'
        );
      }
    }
  }, [handleDecodedPayload, stopCameraAndScanner]);

  const handleToggleTorch = async () => {
    if (!torchSupported || !streamRef.current) return;
    Haptics.buttonPress();

    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !torchOn;
      await track.applyConstraints({
        // @ts-expect-error W3C ImageCapture torch constraint
        advanced: [{ torch: nextState }],
      });
      setTorchOn(nextState);
    } catch {
      setTorchOn(false);
    }
  };

  const handleClose = useCallback(() => {
    Haptics.buttonPress();
    sessionNonceRef.current++;
    stopCameraAndScanner();
    onClose();
  }, [onClose, stopCameraAndScanner]);

  useEffect(() => {
    if (!isOpen) {
      sessionNonceRef.current++;
      stopCameraAndScanner();
      setCameraState('idle');
      setConnectedKiosk(null);
      setScanWarning(null);
      return;
    }

    const startTimer = window.setTimeout(() => {
      startCameraAndScanner();
    }, 40);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(startTimer);
      window.removeEventListener('keydown', handleKeyDown);
      sessionNonceRef.current++;
      stopCameraAndScanner();
    };
  }, [isOpen, startCameraAndScanner, stopCameraAndScanner, handleClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan Kiosk QR Code"
      className="fixed inset-x-0 top-0 bottom-[calc(66px+env(safe-area-inset-bottom,0px))] z-30 bg-[#0D1410] flex flex-col antialiased text-white overflow-hidden select-none"
    >
      {/* Live Rear Camera Feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Matte Dark Viewfinder Vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-between"
        aria-hidden="true"
      >
        <div className="w-full flex-1 bg-[#0D1410]/70" />
        <div className="w-full flex items-center justify-center shrink-0">
          <div className="flex-1 h-[232px] sm:h-[276px] bg-[#0D1410]/70" />
          <div className="w-[232px] sm:w-[276px] h-[232px] sm:h-[276px] rounded-2xl shrink-0" />
          <div className="flex-1 h-[232px] sm:h-[276px] bg-[#0D1410]/70" />
        </div>
        <div className="w-full flex-1 bg-[#0D1410]/70" />
      </div>

      {/* Header Row: Back + Optional Flashlight */}
      <header className="relative z-20 w-full pt-safe px-4 pt-3 flex items-center justify-between gap-2 max-w-2xl mx-auto shrink-0">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Go back"
          className="min-h-[44px] pl-3 pr-4 rounded-xl bg-black/45 hover:bg-black/65 text-white border border-white/15 inline-flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft size={17} weight="bold" aria-hidden="true" />
          <span className="text-[13px] font-semibold">{t.scannerBack}</span>
        </button>

        {torchSupported ? (
          <button
            type="button"
            onClick={handleToggleTorch}
            aria-label={torchOn ? 'Turn flashlight off' : 'Turn flashlight on'}
            className={`w-11 h-11 rounded-xl border flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
              torchOn
                ? 'bg-[#EAF3ED] text-[#194F34] border-[#9ED3AA]'
                : 'bg-black/45 text-white border-white/15 hover:bg-black/65'
            }`}
          >
            <Flashlight size={19} weight={torchOn ? 'fill' : 'regular'} aria-hidden="true" />
          </button>
        ) : (
          <div className="w-11 h-11 shrink-0" aria-hidden="true" />
        )}
      </header>

      {/* Main Vertical Framing Stack */}
      <div className="relative z-20 flex-1 flex flex-col items-center justify-center px-5 py-3 min-h-0">
        {/* Heading & Short Instruction */}
        <div className="text-center mb-4 sm:mb-5 max-w-xs">
          <h1 className="text-[20px] sm:text-[22px] font-bold text-white tracking-tight leading-snug">
            Scan Kiosk QR Code
          </h1>
          <p className="text-[13px] text-white/80 leading-relaxed mt-1">
            Scan the QR code displayed on the Print Point kiosk to continue.
          </p>
        </div>

        {/* Central Scanning Zone with 4 Green Corner Brackets & Scan Line */}
        <div className="relative w-[232px] sm:w-[276px] h-[232px] sm:h-[276px] rounded-2xl overflow-hidden shrink-0">
          {/* Corner Brackets */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute top-0 left-0 w-9 h-9 border-t-[3.5px] border-l-[3.5px] border-[#9ED3AA] rounded-tl-2xl" />
            <div className="absolute top-0 right-0 w-9 h-9 border-t-[3.5px] border-r-[3.5px] border-[#9ED3AA] rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 w-9 h-9 border-b-[3.5px] border-l-[3.5px] border-[#9ED3AA] rounded-bl-2xl" />
            <div className="absolute bottom-0 right-0 w-9 h-9 border-b-[3.5px] border-r-[3.5px] border-[#9ED3AA] rounded-br-2xl" />
          </div>

          {/* Restrained Scanning-Line Animation */}
          {cameraState === 'active' && !connectedKiosk && (
            <div
              aria-hidden="true"
              className="absolute left-3 right-3 h-[2px] rounded-full bg-[#9ED3AA] shadow-[0_0_8px_rgba(158,211,170,0.65)] animate-scan-beam pointer-events-none"
            />
          )}
        </div>

        {/* Bottom Frame Instruction / Validation Error Alert */}
        <div className="mt-5 w-full max-w-xs flex flex-col items-center min-h-[48px] justify-start">
          <AnimatePresence mode="wait">
            {scanWarning ? (
              <motion.div
                key="scan-warning"
                role="alert"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: PP_EASE.standard }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-[#93000A] flex items-start gap-2.5 shadow-lg"
              >
                <WarningCircle
                  size={17}
                  weight="fill"
                  className="text-[#BA1A1A] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span className="text-[12.5px] font-semibold leading-snug">
                  {scanWarning}
                </span>
              </motion.div>
            ) : (
              <motion.p
                key="scan-align-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[13px] font-medium text-white/90 text-center"
              >
                Align the QR code inside the frame.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Camera Starting State */}
      {cameraState === 'starting' && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-30 bg-[#0D1410]/95 flex flex-col items-center justify-center p-6 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#194F34] text-[#9ED3AA] flex items-center justify-center mb-3.5">
            <ArrowsClockwise size={24} weight="bold" className="animate-spin" aria-hidden="true" />
          </div>
          <h2 className="text-[16px] font-bold text-white">Starting Camera</h2>
          <p className="text-[13px] text-white/75 mt-1 max-w-xs">
            Allow camera access when prompted to scan the kiosk QR code.
          </p>
        </div>
      )}

      {/* Camera Permission Denied / Unavailable State */}
      {cameraState === 'error' && (
        <div
          role="alert"
          className="absolute inset-0 z-30 bg-[#0D1410]/96 flex flex-col items-center justify-center p-5 text-center overflow-y-auto"
        >
          <div className="w-full max-w-xs rounded-2xl bg-[#16201A] border border-white/12 p-5 shadow-xl flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF1F2]/12 text-[#FECDD3] border border-[#FECDD3]/25 flex items-center justify-center mb-3">
              <CameraSlash size={24} weight="duotone" aria-hidden="true" />
            </div>

            <h2 className="text-[16px] font-bold text-white">{errorTitle}</h2>
            <p className="text-[13px] text-white/75 mt-1.5 mb-5 leading-relaxed">
              {errorMessage}
            </p>

            <div className="flex flex-col gap-2.5 w-full">
              <Button
                variant="primary"
                size="md"
                fullWidth
                leftIcon={<ArrowsClockwise size={16} weight="bold" aria-hidden="true" />}
                onClick={startCameraAndScanner}
              >
                Try Again
              </Button>
              <Button
                variant="ghost"
                size="md"
                fullWidth
                onClick={handleClose}
                className="text-white/85 hover:bg-white/10 hover:text-white border border-white/15"
              >
                {t.scannerBack}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Smooth Green Checkmark Success Overlay */}
      <AnimatePresence>
        {connectedKiosk && (
          <motion.div
            role="status"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: PP_EASE.standard }}
            className="absolute inset-0 z-40 bg-[#194F34] flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.72, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.32, ease: PP_EASE.sheet }}
              className="w-16 h-16 rounded-full bg-[#EAF3ED] text-[#194F34] flex items-center justify-center mb-4 shadow-lg"
            >
              <CheckCircle size={38} weight="fill" aria-hidden="true" />
            </motion.div>

            <h2 className="text-[20px] font-bold text-white tracking-tight">
              Kiosk Connected Successfully
            </h2>
            <p className="text-[13px] text-[#B9EFC5] mt-1.5 font-medium">
              {connectedKiosk} · Redirecting to upload files...
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
};
