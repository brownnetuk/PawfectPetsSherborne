import { useEffect, useState } from 'react';
import * as api from '../api/client';
import RichLabel from './richLabel';

// A display field's staff-managed copy from Settings > Business Info --
// fetched from the same public endpoints, and shown in the same boxes, as
// the intake wizard's AgreementStep, so a form shows exactly the terms and
// declaration customers see when they register. `fallback` (the field's own
// label) shows until/unless there's a live copy to replace it.
export default function SettingsContent({
  content,
  fallback,
}: {
  content: 'terms' | 'declaration';
  fallback: string;
}) {
  const [termsHtml, setTermsHtml] = useState<string | null>(null);
  const [declarationText, setDeclarationText] = useState<string | null>(null);

  useEffect(() => {
    if (content === 'terms') {
      api
        .fetchTerms()
        .then((r) => setTermsHtml(r.html || null))
        .catch(() => setTermsHtml(null));
    } else {
      api
        .fetchDeclarationText()
        .then((r) => setDeclarationText(r.text || null))
        .catch(() => setDeclarationText(null));
    }
  }, [content]);

  if (content === 'terms') {
    return (
      <div className="terms-box terms-box--tall">
        {termsHtml ? (
          <div dangerouslySetInnerHTML={{ __html: termsHtml }} />
        ) : (
          <p style={{ whiteSpace: 'pre-wrap' }}>
            <RichLabel text={fallback} />
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <h2 style={{ fontSize: '1.15rem' }}>Declaration</h2>
      <div className="terms-box">
        <p>{declarationText ?? <RichLabel text={fallback} />}</p>
      </div>
    </div>
  );
}
