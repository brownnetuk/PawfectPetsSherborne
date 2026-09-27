import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Badge from '../components/Badge';
import { PdfContentIcon, ReadingContentIcon, VideoContentIcon } from '../components/icons';
import TrainingPdfViewer from '../components/TrainingPdfViewer';
import type { MyTrainingListEntry, StartAttemptResult, SubmitAttemptResult } from '../types';

function youtubeEmbedUrl(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([\w-]{6,})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

type View = 'list' | 'detail' | 'quiz' | 'results';

export default function MyTrainingPage() {
  const [entries, setEntries] = useState<MyTrainingListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [detail, setDetail] = useState<MyTrainingListEntry | null>(null);
  const [attempt, setAttempt] = useState<StartAttemptResult | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [results, setResults] = useState<SubmitAttemptResult | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    api
      .listMyTraining()
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your training'));
  }
  useEffect(refresh, []);

  async function openModule(id: string) {
    setError(null);
    try {
      const entry = await api.getMyTrainingModule(id);
      setDetail(entry);
      setView('detail');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this module');
    }
  }

  async function startQuiz() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const started = await api.startTrainingAttempt(detail.module._id);
      setAttempt(started);
      setAnswers(new Array(started.questions.length).fill(null));
      setView('quiz');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the quiz');
    } finally {
      setBusy(false);
    }
  }

  async function submitQuiz() {
    if (!attempt) return;
    if (answers.some((a) => a === null)) {
      setError('Please answer every question before submitting.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.submitTrainingAttempt(attempt.attemptId, answers as number[]);
      setResults(result);
      setView('results');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit the quiz');
    } finally {
      setBusy(false);
    }
  }

  function backToList() {
    setDetail(null);
    setAttempt(null);
    setAnswers([]);
    setResults(null);
    setView('list');
    refresh();
  }

  if (view === 'list') {
    return (
      <div>
        <div className="page-header">
          <h1>My Training</h1>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="card" style={{ padding: 0 }}>
          {!entries ? (
            <div className="empty-state">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="empty-state">You have no training modules assigned right now.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Last Score</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.module._id} onDoubleClick={() => openModule(e.module._id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <strong>{e.module.name}</strong>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{e.assignment.lastScorePercent !== undefined ? `${e.assignment.lastScorePercent}%` : '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>
                      {new Date(e.assignment.nextDueDate ?? e.assignment.dueDate).toLocaleDateString('en-GB')}
                    </td>
                    <td>
                      <Badge value={e.status} />
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openModule(e.module._id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  if (view === 'detail' && detail) {
    return (
      <div>
        <button type="button" className="btn-link" onClick={backToList} style={{ marginBottom: 14 }}>
          ← Back to My Training
        </button>
        <div className="page-header">
          <h1 style={{ fontSize: '1.3rem' }}>{detail.module.name}</h1>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {detail.module.description && <p style={{ color: 'var(--muted)' }}>{detail.module.description}</p>}

        {[...detail.module.contentBlocks]
          .sort((a, b) => a.order - b.order)
          .map((b) => (
            <div key={b._id} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--brand-green-soft)' }}>
                {b.type === 'video' && <VideoContentIcon />}
                {b.type === 'reading' && <ReadingContentIcon />}
                {b.type === 'pdf' && <PdfContentIcon />}
                <strong style={{ color: 'var(--ink)' }}>{b.title}</strong>
              </div>
              {b.type === 'video' && b.videoUrl && youtubeEmbedUrl(b.videoUrl) && (
                <iframe
                  src={youtubeEmbedUrl(b.videoUrl)!}
                  title={b.title || 'Training video'}
                  style={{ width: '100%', maxWidth: 560, height: 315, border: 'none', borderRadius: 8 }}
                  allowFullScreen
                />
              )}
              {b.type === 'reading' && <div dangerouslySetInnerHTML={{ __html: b.readingText ?? '' }} />}
              {b.type === 'pdf' && <TrainingPdfViewer moduleId={detail.module._id} blockId={b._id} />}
            </div>
          ))}

        <button className="btn btn-primary" onClick={startQuiz} disabled={busy}>
          {busy ? 'Starting…' : 'Start Quiz'}
        </button>
      </div>
    );
  }

  if (view === 'quiz' && attempt) {
    return (
      <div>
        <div className="page-header">
          <h1 style={{ fontSize: '1.3rem' }}>Quiz — {detail?.module.name}</h1>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <p style={{ color: 'var(--muted)' }}>Pass mark: {attempt.passMarkPercent}%</p>
        {attempt.questions.map((q, i) => (
          <div key={q.questionId} className="card">
            <div style={{ fontWeight: 600, marginBottom: 10 }}>
              {i + 1}. {q.text}
            </div>
            {q.options.map((opt, optIndex) => (
              <label key={optIndex} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name={`quiz-q${i}`}
                  checked={answers[i] === optIndex}
                  onChange={() => setAnswers((prev) => prev.map((a, j) => (j === i ? optIndex : a)))}
                />
                {opt}
              </label>
            ))}
          </div>
        ))}
        <button className="btn btn-primary" onClick={submitQuiz} disabled={busy}>
          {busy ? 'Submitting…' : 'Submit Quiz'}
        </button>
      </div>
    );
  }

  if (view === 'results' && results) {
    return (
      <div>
        <div className="page-header">
          <h1 style={{ fontSize: '1.3rem' }}>Quiz Results — {detail?.module.name}</h1>
        </div>
        <div className="card">
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: 6 }}>{results.scorePercent}%</div>
          <span className={`badge badge-${results.passed ? 'completed' : 'declined'}`}>{results.passed ? 'Pass' : 'Fail'}</span>
          <div style={{ color: 'var(--muted)', marginTop: 6 }}>Pass mark: {results.passMarkPercent}%</div>
        </div>
        {results.review.map((r, i) => {
          return (
            <div key={i} className="card">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                {i + 1}. {r.text}
              </div>
              {r.options.map((opt, optIndex) => {
                const isSelected = optIndex === r.selectedIndex;
                const isCorrect = optIndex === r.correctIndex;
                return (
                  <div
                    key={optIndex}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      marginBottom: 4,
                      background: isCorrect ? 'var(--sage-badge)' : isSelected ? 'var(--error-light)' : 'transparent',
                      color: isCorrect ? 'var(--brand-green)' : isSelected ? 'var(--error)' : 'var(--ink)',
                    }}
                  >
                    {opt}
                    {isSelected && !isCorrect ? ' (your answer)' : ''}
                    {isCorrect ? ' (correct answer)' : ''}
                  </div>
                );
              })}
            </div>
          );
        })}
        <button className="btn btn-primary" onClick={backToList}>
          Back to My Training
        </button>
      </div>
    );
  }

  return null;
}
