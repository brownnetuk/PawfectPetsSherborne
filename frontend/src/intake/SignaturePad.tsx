import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Props {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
}

export default function SignaturePad({ value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSignature, setHasSignature] = useState(!!value);

  // Kept in sync via effect below rather than read directly, so the resize
  // handler (attached once) always redraws whatever's actually on the pad
  // instead of a stale value captured at mount.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Sizes the canvas's actual pixel buffer to match its rendered CSS size
  // (times devicePixelRatio, for crisp lines on high-DPI phone screens)
  // rather than a fixed 480x160 buffer that CSS then stretches or squashes
  // to fit -- a canvas's width/height attributes set its own coordinate
  // system independent of its rendered size, so on a narrower mobile
  // viewport the old fixed buffer left both the drawn signature and the
  // touch coordinates mismatched with where the finger actually was.
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
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="signature-actions">
        <span className="hint">{hasSignature ? 'Signed' : 'Sign above with your mouse or finger'}</span>
        <button type="button" className="btn-link" onClick={clear}>
          Clear
        </button>
      </div>
    </div>
  );
}
