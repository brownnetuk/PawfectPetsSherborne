import { useEffect, useState } from 'react';
import * as api from '../api/client';

// The content-file route requires a Bearer token like every other API call,
// but a plain <iframe src="..."> request can't carry one -- so this fetches
// the PDF as a blob (same auth path as any other API call) and points the
// iframe at a local object URL instead of the API URL directly.
export default function TrainingPdfViewer({ moduleId, blockId, height = 500 }: { moduleId: string; blockId: string; height?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    api
      .getTrainingContentFile(moduleId, blockId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load this file'));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [moduleId, blockId]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!url) return <div className="empty-state">Loading…</div>;
  return (
    <iframe
      src={url}
      title="Document"
      style={{ width: '100%', height, border: '1px solid var(--border)', borderRadius: 8 }}
    />
  );
}
