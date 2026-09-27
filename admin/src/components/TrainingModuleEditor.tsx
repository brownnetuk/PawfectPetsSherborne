import { useState } from 'react';
import * as api from '../api/client';
import { REVIEW_FREQUENCY_OPTIONS } from './RiskAssessmentsTab';
import { DragHandleIcon, TrashIcon } from './icons';
import Modal from './Modal';
import RichTextEditor from './RichTextEditor';
import type { ContentBlockType, TrainingContentBlock, TrainingModule, TrainingQuestion } from '../types';

type EditableBlock = Omit<TrainingContentBlock, '_id'> & { _id?: string };
type EditableQuestion = Omit<TrainingQuestion, '_id'> & { _id?: string };

const CONTENT_TYPE_LABELS: Record<ContentBlockType, string> = { video: 'Video', reading: 'Reading', pdf: 'PDF' };

function youtubeEmbedUrl(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([\w-]{6,})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

function newBlock(type: ContentBlockType, order: number): EditableBlock {
  return { order, type, title: type === 'video' ? 'New Video' : type === 'reading' ? 'New Reading' : 'New PDF' };
}

function newQuestion(): EditableQuestion {
  return { text: '', options: ['', '', '', ''], correctIndex: 0 };
}

type Tab = 'content' | 'test' | 'settings';

export default function TrainingModuleEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial?: TrainingModule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<Tab>('content');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'draft');
  const [blocks, setBlocks] = useState<EditableBlock[]>(initial?.contentBlocks ?? []);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [questions, setQuestions] = useState<EditableQuestion[]>(initial?.questionBank ?? []);
  const [passMarkPercent, setPassMarkPercent] = useState(initial?.passMarkPercent ?? 80);
  const [questionsPerAttempt, setQuestionsPerAttempt] = useState(initial?.questionsPerAttempt ?? 5);
  const [reviewFrequency, setReviewFrequency] = useState(initial?.reviewFrequency ?? '');
  const [dueWithinDays, setDueWithinDays] = useState(initial?.dueWithinDays ?? 14);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateBlock(i: number, patch: Partial<EditableBlock>) {
    setBlocks((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  }
  function removeBlock(i: number) {
    setBlocks((prev) => prev.filter((_, j) => j !== i).map((b, j) => ({ ...b, order: j })));
  }
  function moveBlock(i: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((b, k) => ({ ...b, order: k }));
    });
  }
  function addBlock(type: ContentBlockType) {
    setBlocks((prev) => [...prev, newBlock(type, prev.length)]);
    setShowAddPicker(false);
  }

  function handlePdfFileChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a .pdf file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateBlock(i, { pdfFile: reader.result as string, pdfFileName: file.name });
    reader.onerror = () => setError('Failed to read that file.');
    reader.readAsDataURL(file);
  }

  // The content-file route needs a Bearer token like any other API call, so
  // it's fetched as a blob (same as api.getTrainingContentFile elsewhere)
  // rather than opened directly as a link -- a plain <a href> request
  // wouldn't carry the auth header.
  async function viewSavedPdf(moduleId: string, blockId: string) {
    try {
      const blob = await api.getTrainingContentFile(moduleId, blockId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open this file');
    }
  }

  function updateQuestion(i: number, patch: Partial<EditableQuestion>) {
    setQuestions((prev) => prev.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }
  function updateOption(i: number, optIndex: number, text: string) {
    setQuestions((prev) =>
      prev.map((q, j) => (j === i ? { ...q, options: q.options.map((o, k) => (k === optIndex ? text : o)) } : q)),
    );
  }
  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, j) => j !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // The backend's DTOs don't accept `_id` on content blocks/questions
      // (whitelist validation rejects unknown properties) -- it's only kept
      // in local state for React keys and the "view saved PDF" link.
      const input = {
        name,
        description: description || undefined,
        status,
        contentBlocks: blocks.map(({ _id: _unused, ...rest }) => rest),
        questionBank: questions.map(({ _id: _unused, ...rest }) => rest),
        passMarkPercent,
        questionsPerAttempt,
        reviewFrequency: reviewFrequency || undefined,
        dueWithinDays,
      };
      if (initial) {
        await api.updateTrainingModule(initial._id, input);
      } else {
        await api.createTrainingModule(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this training module');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initial ? `Edit Module — ${initial.name}` : 'New Training Module'}
      onClose={onClose}
      full
      headerActions={
        <button type="button" className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save Module'}
        </button>
      }
    >
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Module Name *</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>

      <div className="tabs">
        <button type="button" className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}>
          Content
        </button>
        <button type="button" className={tab === 'test' ? 'active' : ''} onClick={() => setTab('test')}>
          Test
        </button>
        <button type="button" className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
          Settings
        </button>
      </div>

      {tab === 'content' && (
        <div>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -8 }}>
            Staff work through these in order, then take the test below.
          </p>
          {blocks.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 16, border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4, color: 'var(--muted)' }}>
                <DragHandleIcon />
                <button type="button" className="icon-btn" title="Move up" onClick={() => moveBlock(i, -1)} disabled={i === 0}>
                  ▲
                </button>
                <button type="button" className="icon-btn" title="Move down" onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1}>
                  ▼
                </button>
              </div>
              <div style={{ flexGrow: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span className="badge badge-active">{CONTENT_TYPE_LABELS[b.type]}</span>
                  <input
                    type="text"
                    value={b.title ?? ''}
                    onChange={(e) => updateBlock(i, { title: e.target.value })}
                    placeholder="Block title"
                    style={{ flexGrow: 1, maxWidth: 360 }}
                  />
                </div>
                {b.type === 'video' && (
                  <div>
                    <input
                      type="text"
                      value={b.videoUrl ?? ''}
                      onChange={(e) => updateBlock(i, { videoUrl: e.target.value })}
                      placeholder="e.g. https://youtu.be/dQw4w9WgXcQ"
                      style={{ marginBottom: 10 }}
                    />
                    {b.videoUrl && youtubeEmbedUrl(b.videoUrl) ? (
                      <iframe
                        src={youtubeEmbedUrl(b.videoUrl)!}
                        title={b.title || 'Video preview'}
                        style={{ width: 320, height: 180, border: 'none', borderRadius: 8 }}
                        allowFullScreen
                      />
                    ) : (
                      <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Enter a YouTube URL to preview it here.</div>
                    )}
                  </div>
                )}
                {b.type === 'reading' && <RichTextEditor value={b.readingText ?? ''} onChange={(v) => updateBlock(i, { readingText: v })} />}
                {b.type === 'pdf' && (
                  <div>
                    <input type="file" accept=".pdf" onChange={(e) => handlePdfFileChange(i, e)} />
                    {b.pdfFileName && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                        {b.pdfFile && b._id && initial ? (
                          <button type="button" className="btn-link" onClick={() => viewSavedPdf(initial._id, b._id!)}>
                            {b.pdfFileName}
                          </button>
                        ) : (
                          <span>{b.pdfFileName}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={() => removeBlock(i)}>
                <TrashIcon />
              </button>
            </div>
          ))}

          {showAddPicker ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addBlock('video')}>
                Video
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addBlock('reading')}>
                Reading
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addBlock('pdf')}>
                PDF
              </button>
              <button type="button" className="btn-link" onClick={() => setShowAddPicker(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddPicker(true)}>
              + Add Content Block
            </button>
          )}
        </div>
      )}

      {tab === 'test' && (
        <div>
          <div className="field-row">
            <div className="field">
              <label>Pass mark (%)</label>
              <input type="number" min={0} max={100} value={passMarkPercent} onChange={(e) => setPassMarkPercent(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Questions per attempt</label>
              <input type="number" min={1} value={questionsPerAttempt} onChange={(e) => setQuestionsPerAttempt(Number(e.target.value))} />
            </div>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -10 }}>
            Bank size: {questions.length} question{questions.length === 1 ? '' : 's'} · staff are asked {questionsPerAttempt} at random each attempt.
          </p>

          {questions.map((q, i) => (
            <div key={i} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <input
                  type="text"
                  value={q.text}
                  onChange={(e) => updateQuestion(i, { text: e.target.value })}
                  placeholder={`Question ${i + 1}`}
                  style={{ flexGrow: 1 }}
                />
                <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={() => removeQuestion(i)}>
                  <TrashIcon />
                </button>
              </div>
              {q.options.map((opt, optIndex) => (
                <div key={optIndex} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input
                    type="radio"
                    name={`q${i}-correct`}
                    checked={q.correctIndex === optIndex}
                    onChange={() => updateQuestion(i, { correctIndex: optIndex })}
                  />
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, optIndex, e.target.value)}
                    placeholder={`Option ${optIndex + 1}`}
                    style={{ flexGrow: 1 }}
                  />
                </div>
              ))}
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={() => setQuestions((prev) => [...prev, newQuestion()])}>
            + Add Question
          </button>
        </div>
      )}

      {tab === 'settings' && (
        <div style={{ maxWidth: 460 }}>
          <div className="field">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="field">
            <label>Review frequency</label>
            <select value={reviewFrequency} onChange={(e) => setReviewFrequency(e.target.value)}>
              <option value="">-- Select --</option>
              {REVIEW_FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Due within (days of assignment)</label>
            <input type="number" min={1} value={dueWithinDays} onChange={(e) => setDueWithinDays(Number(e.target.value))} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TrainingModule['status'])}>
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="live">Live</option>
            </select>
          </div>
        </div>
      )}
    </Modal>
  );
}
