import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  selectedDate: string;
  value: string;
  onChange: (dataUrl: string) => void;
  error?: string;
}

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 220;

export function SignaturePad({ selectedDate, value, onChange, error }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStroke, setHasStroke] = useState(Boolean(value));

  useEffect(() => {
    if (!value) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
      }
      hasDrawnRef.current = false;
      setHasStroke(false);
    } else {
      hasDrawnRef.current = true;
      setHasStroke(true);
    }
  }, [value]);

  const getRelativePoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getRelativePoint(e);
    isDrawingRef.current = true;
    hasDrawnRef.current = true;
    lastPointRef.current = pt;

    ctx.strokeStyle = '#0A0A0A';
    ctx.fillStyle = '#0A0A0A';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.3, 0, Math.PI * 2);
    ctx.fill();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const lastPt = lastPointRef.current;
    if (!canvas || !lastPt) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getRelativePoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPt.x, lastPt.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPointRef.current = pt;
  };

  const commitStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (canvas && hasDrawnRef.current) {
      setHasStroke(true);
      onChange(canvas.toDataURL('image/png'));
    }
  }, [onChange]);

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    isDrawingRef.current = false;
    hasDrawnRef.current = false;
    lastPointRef.current = null;
    setHasStroke(false);
    onChange('');
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className="text-xs text-neutral-600">
          <span>Kolom Tanda Tangan</span>
          <span aria-hidden="true" className="mx-1.5 text-neutral-400">
            ·
          </span>
          <span className="font-mono tabular-nums font-semibold text-[#C23008]">
            {selectedDate}
          </span>
        </div>
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasStroke}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B]"
        >
          <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
          Hapus Tanda Tangan
        </button>
      </div>

      <div
        className={`relative rounded-lg border bg-white overflow-hidden transition-colors ${
          error
            ? 'border-red-600 ring-1 ring-red-600/20'
            : hasStroke
              ? 'border-neutral-900'
              : 'border-neutral-300'
        }`}
      >
        {!hasStroke && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
          >
            <p className="text-sm text-neutral-400 select-none">
              Goreskan tanda tangan digital di area ini
            </p>
            <p className="text-xs text-neutral-400 mt-1 select-none font-mono tabular-nums">
              Untuk tanggal pelatihan {selectedDate}
            </p>
          </div>
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 bottom-8 border-b border-dashed border-neutral-200"
        />

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          data-testid="signature-canvas"
          aria-label={`Area tanda tangan digital untuk tanggal pelatihan ${selectedDate}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={commitStroke}
          onPointerCancel={commitStroke}
          className="w-full h-48 sm:h-52 touch-none cursor-crosshair block bg-transparent relative z-10"
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        {error ? (
          <p role="alert" className="text-red-600 font-medium">
            {error}
          </p>
        ) : (
          <p className={hasStroke ? 'text-[#C23008] font-medium' : 'text-neutral-500'}>
            {hasStroke
              ? 'Tanda tangan digital telah terekam.'
              : 'Gunakan mouse, trackpad, stylus, atau jari di layar sentuh.'}
          </p>
        )}
      </div>
    </div>
  );
}
