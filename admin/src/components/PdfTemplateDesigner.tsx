import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import {
  DEFAULT_INVOICE_TEMPLATE,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  PDF_PLACEHOLDERS,
  buildInvoicePdf,
  elementTypeLabel,
} from '../pdf/invoicePdf';
import type { BusinessInfo, Invoice, PdfElementType, PdfTemplateElement, PdfVisibility } from '../types';

const SCALE = 1.15; // px per pt -- large enough to actually work in, still fits most screens
const CANVAS_W = PAGE_WIDTH * SCALE;
const CANVAS_H = PAGE_HEIGHT * SCALE;

function newId(): string {
  return `el-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function sampleInvoice(): Invoice {
  return {
    _id: 'sample',
    customer: { _id: 'sample-customer', name: 'Charlie Allhusen', email: 'charlie@example.com', address: 'The Old Farmhouse\nStowell\nSherborne\nDT94PE\nUnited Kingdom', phoneNumber: '07700 900123' },
    invoiceNumber: 'INV-00501',
    lineItems: [
      { description: 'Half Hour Dog Walk (Group)', quantity: 1, unitPrice: 10.5 },
      { description: 'Travel — Stowell', quantity: 1, unitPrice: 8 },
    ],
    subtotal: 18.5,
    total: 18.5,
    status: 'paid',
    issueDate: new Date().toISOString(),
    dueDate: new Date().toISOString(),
    paymentTerms: 'Due on Receipt',
    amountPaid: 18.5,
    createdAt: new Date().toISOString(),
  };
}

function defaultElement(type: PdfElementType): PdfTemplateElement {
  const base = { id: newId(), x: 60, y: 60, width: 160, height: 24 };
  switch (type) {
    case 'text':
      return { ...base, type, content: 'New text', fontSize: 10, fontWeight: 'normal', color: '#232c26', align: 'left' };
    case 'image':
      return { ...base, type, width: 60, height: 60, src: 'logo' };
    case 'line':
      return { ...base, type, width: 160, height: 0, strokeColor: '#e3e8de', lineWidth: 1 };
    case 'rect':
      return { ...base, type, width: 160, height: 60, fillColor: '#f3f6ee', strokeColor: undefined };
    case 'qrcode':
      return { ...base, type, width: 64, height: 64, content: '{{bankName}} {{sortCode}} {{accountNumber}}' };
    case 'itemTable':
      return { ...base, type, width: 400, height: 140 };
  }
}

const ADD_TYPES: PdfElementType[] = ['text', 'image', 'line', 'rect', 'qrcode', 'itemTable'];

export default function PdfTemplateDesigner() {
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [elements, setElements] = useState<PdfTemplateElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const historyRef = useRef<{ past: PdfTemplateElement[][]; future: PdfTemplateElement[][] }>({ past: [], future: [] });
  const dragSnapshotRef = useRef<PdfTemplateElement[] | null>(null);
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    handle?: string;
    startClientX: number;
    startClientY: number;
    ids: string[];
    startEls: Map<string, PdfTemplateElement>;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .getBusinessInfo()
      .then((info) => {
        setBusinessInfo(info);
        setElements(info.invoicePdfTemplate?.length ? info.invoicePdfTemplate : DEFAULT_INVOICE_TEMPLATE);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the PDF template'));
  }, []);

  function commitNow(next: PdfTemplateElement[]) {
    historyRef.current.past.push(elements);
    historyRef.current.future = [];
    setElements(next);
    setSaved(false);
  }

  function undo() {
    const past = historyRef.current.past;
    if (past.length === 0) return;
    const prev = past.pop()!;
    historyRef.current.future.push(elements);
    setElements(prev);
    setSaved(false);
  }

  function redo() {
    const future = historyRef.current.future;
    if (future.length === 0) return;
    const next = future.pop()!;
    historyRef.current.past.push(elements);
    setElements(next);
    setSaved(false);
  }

  // Elements sharing a groupId always select/move/delete together -- clicking
  // any member selects the whole group.
  function groupMembers(id: string): string[] {
    const el = elements.find((e) => e.id === id);
    if (!el?.groupId) return [id];
    return elements.filter((e) => e.groupId === el.groupId).map((e) => e.id);
  }

  function updateSelected(patch: Partial<PdfTemplateElement>) {
    if (selectedIds.length !== 1) return;
    const id = selectedIds[0];
    commitNow(elements.map((el) => (el.id === id ? ({ ...el, ...patch } as PdfTemplateElement) : el)));
  }

  function addElement(type: PdfElementType) {
    const el = defaultElement(type);
    commitNow([...elements, el]);
    setSelectedIds([el.id]);
  }

  function deleteSelected() {
    if (selectedIds.length === 0) return;
    commitNow(elements.filter((el) => !selectedIds.includes(el.id)));
    setSelectedIds([]);
  }

  function bringToFront() {
    if (selectedIds.length === 0) return;
    const picked = elements.filter((el) => selectedIds.includes(el.id));
    commitNow([...elements.filter((el) => !selectedIds.includes(el.id)), ...picked]);
  }

  function sendToBack() {
    if (selectedIds.length === 0) return;
    const picked = elements.filter((el) => selectedIds.includes(el.id));
    commitNow([...picked, ...elements.filter((el) => !selectedIds.includes(el.id))]);
  }

  function groupSelected() {
    if (selectedIds.length < 2) return;
    const gid = newId();
    commitNow(elements.map((el) => (selectedIds.includes(el.id) ? { ...el, groupId: gid } : el)));
  }

  function ungroupSelected() {
    if (selectedIds.length === 0) return;
    commitNow(elements.map((el) => (selectedIds.includes(el.id) ? { ...el, groupId: undefined } : el)));
  }

  function resetToDefault() {
    commitNow(DEFAULT_INVOICE_TEMPLATE);
    setSelectedIds([]);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateBusinessInfo({ invoicePdfTemplate: elements });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the PDF template');
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    setPreviewLoading(true);
    setError(null);
    try {
      const info = businessInfo ?? (await api.getBusinessInfo());
      const doc = await buildInvoicePdf(sampleInvoice(), 'invoice', { ...info, invoicePdfTemplate: elements });
      setPreviewUrl(URL.createObjectURL(doc.output('blob')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render the preview');
    } finally {
      setPreviewLoading(false);
    }
  }

  // Arrow-key nudge for the selected block(s) -- ignored while focus is
  // inside a form field, so it doesn't hijack normal text-cursor navigation.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (selectedIds.length === 0) return;
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        redo();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const deltas: Record<string, [number, number]> = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      };
      const delta = deltas[e.key];
      if (!delta) return;
      e.preventDefault();
      commitNow(
        elements.map((x) => (selectedIds.includes(x.id) ? { ...x, x: x.x + delta[0], y: x.y + delta[1] } : x)),
      );
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, elements]);

  function beginDrag(e: React.PointerEvent, ids: string[], mode: 'move' | 'resize', handle?: string) {
    const startEls = new Map(elements.filter((el) => ids.includes(el.id)).map((el) => [el.id, el] as const));
    dragSnapshotRef.current = elements;
    dragRef.current = { mode, handle, startClientX: e.clientX, startClientY: e.clientY, ids, startEls };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  }

  // Shift+click adds/removes a block (and its group) from the selection;
  // clicking a block that's part of the current multi-selection drags the
  // whole selection together; otherwise clicking replaces the selection with
  // that block's group (or just itself, if ungrouped).
  function handleElementPointerDown(e: React.PointerEvent, el: PdfTemplateElement) {
    e.stopPropagation();
    e.preventDefault();
    let next: string[];
    if (e.shiftKey) {
      const members = groupMembers(el.id);
      next = selectedIds.includes(el.id)
        ? selectedIds.filter((id) => !members.includes(id))
        : Array.from(new Set([...selectedIds, ...members]));
    } else if (selectedIds.includes(el.id) && selectedIds.length > 1) {
      next = selectedIds;
    } else {
      next = groupMembers(el.id);
    }
    setSelectedIds(next);
    beginDrag(e, next, 'move');
  }

  function startResize(e: React.PointerEvent, el: PdfTemplateElement, handle: string) {
    e.stopPropagation();
    e.preventDefault();
    beginDrag(e, [el.id], 'resize', handle);
  }

  function onDragMove(e: PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startClientX) / SCALE;
    const dy = (e.clientY - drag.startClientY) / SCALE;
    setElements((prev) =>
      prev.map((el) => {
        const startEl = drag.startEls.get(el.id);
        if (!startEl) return el;
        if (drag.mode === 'move') {
          return { ...el, x: Math.max(0, startEl.x + dx), y: Math.max(0, startEl.y + dy) };
        }
        let { x, y, width, height } = startEl;
        if (drag.handle?.includes('e')) width = Math.max(10, startEl.width + dx);
        if (drag.handle?.includes('s')) height = Math.max(10, startEl.height + dy);
        if (drag.handle?.includes('w')) {
          width = Math.max(10, startEl.width - dx);
          x = startEl.x + dx;
        }
        if (drag.handle?.includes('n')) {
          height = Math.max(10, startEl.height - dy);
          y = startEl.y + dy;
        }
        return { ...el, x, y, width, height };
      }),
    );
  }

  function onDragEnd() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    dragRef.current = null;
    if (dragSnapshotRef.current) {
      historyRef.current.past.push(dragSnapshotRef.current);
      historyRef.current.future = [];
      dragSnapshotRef.current = null;
      setSaved(false);
    }
  }

  const selectedElements = elements.filter((el) => selectedIds.includes(el.id));
  const hasItemTable = elements.some((el) => el.type === 'itemTable');

  if (!businessInfo) {
    return (
      <div className="card">
        <h2>Invoice Template</h2>
        {error ? <div className="error-banner">{error}</div> : <div className="empty-state">Loading…</div>}
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>Invoice Template</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Drag, resize, add, and remove blocks to design the invoice/quote PDF shown by the "View" action.
            Shift+click to select more than one, then Group them to move as one from now on. A block whose real
            content (a long address, many line items) runs past its box automatically pushes anything below it in
            the same column further down — use Preview to see it with real content.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={undo} disabled={historyRef.current.past.length === 0}>
            Undo
          </button>
          <button className="btn btn-secondary btn-sm" onClick={redo} disabled={historyRef.current.future.length === 0}>
            Redo
          </button>
          <button className="btn btn-secondary btn-sm" onClick={resetToDefault}>
            Reset to Default
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handlePreview} disabled={previewLoading}>
            {previewLoading ? 'Rendering…' : previewUrl ? 'Close Preview' : 'Preview'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {saved && <div style={{ color: 'var(--brand-green)', fontSize: '0.85rem', fontWeight: 600, marginTop: 4 }}>Saved.</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        {ADD_TYPES.map((t) => (
          <button
            key={t}
            className="btn btn-secondary btn-sm"
            onClick={() => addElement(t)}
            disabled={t === 'itemTable' && hasItemTable}
            title={t === 'itemTable' && hasItemTable ? 'Only one item table is allowed' : undefined}
          >
            + {elementTypeLabel(t)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {previewUrl ? (
          <iframe
            src={previewUrl}
            title="PDF preview"
            style={{ width: CANVAS_W, height: CANVAS_H, border: '1px solid var(--border)', borderRadius: 8, background: 'white' }}
          />
        ) : (
          <div
            ref={canvasRef}
            onPointerDown={() => setSelectedIds([])}
            style={{
              position: 'relative',
              width: CANVAS_W,
              height: CANVAS_H,
              background: 'white',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-sm)',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {elements.map((el) => {
              const isSelected = selectedIds.includes(el.id);
              return (
                <div
                  key={el.id}
                  onPointerDown={(e) => handleElementPointerDown(e, el)}
                  style={{
                    position: 'absolute',
                    left: el.x * SCALE,
                    top: el.y * SCALE,
                    width: Math.max(el.width * SCALE, 4),
                    height: Math.max(el.height * SCALE, 2),
                    cursor: 'move',
                    outline: isSelected ? '2px solid var(--accent)' : '1px dashed transparent',
                    outlineOffset: 1,
                    boxSizing: 'border-box',
                  }}
                >
                  <ElementPreview el={el} />
                  {isSelected && selectedIds.length === 1 &&
                    ['nw', 'ne', 'sw', 'se'].map((handle) => (
                      <div
                        key={handle}
                        onPointerDown={(e) => startResize(e, el, handle)}
                        style={{
                          position: 'absolute',
                          width: 9,
                          height: 9,
                          background: 'var(--accent)',
                          border: '1px solid white',
                          borderRadius: 2,
                          cursor: `${handle}-resize`,
                          top: handle.includes('n') ? -5 : undefined,
                          bottom: handle.includes('s') ? -5 : undefined,
                          left: handle.includes('w') ? -5 : undefined,
                          right: handle.includes('e') ? -5 : undefined,
                        }}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        )}

        {!previewUrl && (
          <PropertyPanel
            selectedElements={selectedElements}
            onChange={updateSelected}
            onDelete={deleteSelected}
            onBringToFront={bringToFront}
            onSendToBack={sendToBack}
            onGroup={groupSelected}
            onUngroup={ungroupSelected}
          />
        )}
      </div>
    </div>
  );
}

function ElementPreview({ el }: { el: PdfTemplateElement }) {
  switch (el.type) {
    case 'text':
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            fontSize: Math.max(el.fontSize * SCALE, 6),
            fontWeight: el.fontWeight === 'bold' ? 700 : 400,
            color: el.color,
            textAlign: el.align,
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            lineHeight: 1.25,
            transform: el.rotation ? `rotate(${-el.rotation}deg)` : undefined,
            transformOrigin: 'left top',
          }}
        >
          {el.content}
        </div>
      );
    case 'image':
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            border: '1px dashed var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            color: 'var(--muted)',
          }}
        >
          Logo
        </div>
      );
    case 'line':
      return <div style={{ width: '100%', borderTop: `${Math.max(el.lineWidth, 1)}px solid ${el.strokeColor}` }} />;
    case 'rect':
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: el.fillColor,
            border: el.strokeColor ? `1px solid ${el.strokeColor}` : undefined,
          }}
        />
      );
    case 'qrcode':
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            border: '1px dashed var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            color: 'var(--muted)',
            textAlign: 'center',
          }}
        >
          QR code
        </div>
      );
    case 'itemTable':
      return (
        <div style={{ width: '100%', height: '100%', border: '1px dashed var(--border)' }}>
          <div style={{ background: '#232c26', color: 'white', fontSize: 9, padding: '3px 6px' }}>
            # | Item &amp; Description | Qty | Unit Price | Line Total
          </div>
          <div style={{ fontSize: 8, color: 'var(--muted)', padding: 6 }}>Item rows (from the invoice/quote)</div>
        </div>
      );
  }
}

interface PanelProps {
  selectedElements: PdfTemplateElement[];
  onChange: (patch: Partial<PdfTemplateElement>) => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onGroup: () => void;
  onUngroup: () => void;
}

function PropertyPanel({
  selectedElements,
  onChange,
  onDelete,
  onBringToFront,
  onSendToBack,
  onGroup,
  onUngroup,
}: PanelProps) {
  if (selectedElements.length === 0) {
    return (
      <div style={{ width: 260, flexShrink: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
        Select a block to edit its position, size, and content. Shift+click to select more than one. Use the
        buttons above to add a new one.
      </div>
    );
  }

  if (selectedElements.length > 1) {
    const anyGrouped = selectedElements.some((el) => el.groupId);
    return (
      <div style={{ width: 260, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{selectedElements.length} blocks selected</div>
        <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: 0 }}>
          Group them to always select and move together — clicking any one afterwards selects the whole group.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={onGroup}>
            Group
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onUngroup} disabled={!anyGrouped}>
            Ungroup
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onBringToFront}>
            Bring to front
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onSendToBack}>
            Send to back
          </button>
          <button className="btn btn-danger btn-sm" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  const selected = selectedElements[0];

  function insertPlaceholder(token: string) {
    if (selected.type !== 'text' && selected.type !== 'qrcode') return;
    onChange({ content: `${selected.content}{{${token}}}` } as Partial<PdfTemplateElement>);
  }

  return (
    <div style={{ width: 260, flexShrink: 0 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        {elementTypeLabel(selected.type)}
        {selected.groupId && (
          <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.8rem' }}> · grouped</span>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label>X</label>
          <input type="number" value={Math.round(selected.x)} onChange={(e) => onChange({ x: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Y</label>
          <input type="number" value={Math.round(selected.y)} onChange={(e) => onChange({ y: Number(e.target.value) })} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Width</label>
          <input type="number" value={Math.round(selected.width)} onChange={(e) => onChange({ width: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Height</label>
          <input type="number" value={Math.round(selected.height)} onChange={(e) => onChange({ height: Number(e.target.value) })} />
        </div>
      </div>

      <div className="field">
        <label>Show</label>
        <select
          value={selected.visibleWhen ?? 'always'}
          onChange={(e) => onChange({ visibleWhen: e.target.value as PdfVisibility })}
        >
          <option value="always">Always</option>
          <option value="paid">Only when paid (invoices)</option>
          <option value="unpaid">Only when unpaid (invoices)</option>
        </select>
      </div>

      {selected.type === 'text' && (
        <>
          <div className="field">
            <label>Content</label>
            <textarea value={selected.content} onChange={(e) => onChange({ content: e.target.value })} rows={3} />
          </div>
          <div className="field">
            <label>Insert placeholder</label>
            <select value="" onChange={(e) => e.target.value && insertPlaceholder(e.target.value)}>
              <option value="">Choose…</option>
              {PDF_PLACEHOLDERS.map((p) => (
                <option key={p.token} value={p.token}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Font size</label>
              <input type="number" value={selected.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Weight</label>
              <select value={selected.fontWeight} onChange={(e) => onChange({ fontWeight: e.target.value as 'normal' | 'bold' })}>
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Align</label>
              <select value={selected.align} onChange={(e) => onChange({ align: e.target.value as 'left' | 'center' | 'right' })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div className="field">
              <label>Color</label>
              <input type="color" value={selected.color} onChange={(e) => onChange({ color: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Rotation (°)</label>
            <input type="number" value={selected.rotation ?? 0} onChange={(e) => onChange({ rotation: Number(e.target.value) })} />
          </div>
        </>
      )}

      {selected.type === 'qrcode' && (
        <>
          <div className="field">
            <label>Encoded content</label>
            <textarea value={selected.content} onChange={(e) => onChange({ content: e.target.value })} rows={2} />
          </div>
          <div className="field">
            <label>Insert placeholder</label>
            <select value="" onChange={(e) => e.target.value && insertPlaceholder(e.target.value)}>
              <option value="">Choose…</option>
              {PDF_PLACEHOLDERS.map((p) => (
                <option key={p.token} value={p.token}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {selected.type === 'line' && (
        <div className="field-row">
          <div className="field">
            <label>Color</label>
            <input type="color" value={selected.strokeColor} onChange={(e) => onChange({ strokeColor: e.target.value })} />
          </div>
          <div className="field">
            <label>Thickness</label>
            <input type="number" value={selected.lineWidth} onChange={(e) => onChange({ lineWidth: Number(e.target.value) })} />
          </div>
        </div>
      )}

      {selected.type === 'rect' && (
        <div className="field-row">
          <div className="field">
            <label>Fill</label>
            <input
              type="color"
              value={selected.fillColor ?? '#ffffff'}
              onChange={(e) => onChange({ fillColor: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Border</label>
            <input
              type="color"
              value={selected.strokeColor ?? '#ffffff'}
              onChange={(e) => onChange({ strokeColor: e.target.value })}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={onBringToFront}>
          Bring to front
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onSendToBack}>
          Send to back
        </button>
        {selected.groupId && (
          <button className="btn btn-secondary btn-sm" onClick={onUngroup}>
            Ungroup
          </button>
        )}
        <button className="btn btn-danger btn-sm" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
