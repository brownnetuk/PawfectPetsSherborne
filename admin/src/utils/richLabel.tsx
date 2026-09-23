import { Fragment } from 'react';

// A deliberately tiny, non-nesting markup -- not real Markdown (its own
// `__x__` means bold too; this app only needs two independent, unambiguous
// markers so it doesn't matter that they overlap with Markdown's meaning).
// Used for any FormField.label (form-field.types.ts), authored via the
// Bold/Underline buttons next to FormBuilder's label editor -- rendered
// wherever a label is shown (FieldRenderer/ReadOnlyAnswers/FormPreviewBody
// here, their frontend/ mirrors, and formSubmissionPdf.ts's PDF export,
// which reuses parseRichLabelRuns directly rather than the React component).
export interface RichLabelRun {
  text: string;
  bold: boolean;
  underline: boolean;
}

const RUN_PATTERN = /\*\*(.+?)\*\*|__(.+?)__/g;

export function parseRichLabelRuns(raw: string): RichLabelRun[] {
  const runs: RichLabelRun[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  RUN_PATTERN.lastIndex = 0;
  while ((match = RUN_PATTERN.exec(raw))) {
    if (match.index > lastIndex) {
      runs.push({ text: raw.slice(lastIndex, match.index), bold: false, underline: false });
    }
    if (match[1] !== undefined) {
      runs.push({ text: match[1], bold: true, underline: false });
    } else {
      runs.push({ text: match[2], bold: false, underline: true });
    }
    lastIndex = RUN_PATTERN.lastIndex;
  }
  if (lastIndex < raw.length) {
    runs.push({ text: raw.slice(lastIndex), bold: false, underline: false });
  }
  return runs;
}

/** Renders a FormField.label (or any staff-authored "display" field body) with its bold/underline markup applied. */
export default function RichLabel({ text }: { text: string }) {
  const runs = parseRichLabelRuns(text);
  return (
    <>
      {runs.map((run, i) => {
        let node: React.ReactNode = run.text;
        if (run.bold) node = <strong>{node}</strong>;
        if (run.underline) node = <u>{node}</u>;
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}
