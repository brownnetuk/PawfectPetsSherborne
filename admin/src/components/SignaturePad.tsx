import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Ported from frontend/src/intake/SignaturePad.tsx (the customer-facing
// intake app's signature capture, used for agreement/off-lead consent) so
// staff can sign off a checklist the same way. Admin only ever displayed
// signatures via <img> before this; this is its first capture component.
interface Props {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  // Locks the pad once a signature's already been captured -- e.g. a
  // checklist sign-off shouldn't be alterable after the fact.
  readOnly?: boolean;
}

export default function SignaturePad({ value, onChange, readOnly }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSignature, setHasSignature] = useState(!!value);

  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
    setHasSignature(!!value);
  }, [value]);

  function resize() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1f2933';
    const current = valueRef.current;
    if (current) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = current;
    }
  }

  useLayoutEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getPos(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getPos(e);
    ctx?.lineTo(x, y);
    ctx?.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasSignature(true);
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange(undefined);
  };

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        style={readOnly ? { cursor: 'default', touchAction: 'auto' } : undefined}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="signature-actions">
        <span className="hint">{hasSignature ? 'Signed' : 'Sign above with your mouse or finger'}</span>
        {!readOnly && (
          <button type="button" className="btn-link" onClick={clear}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
