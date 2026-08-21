import { useEffect, useRef, useState } from 'react';

const BLOCKS = [
  { value: 'p', label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
];

// Minimal WYSIWYG editor for template bodies that are stored/sent as raw
// HTML (currently the Invoice/Quote templates) -- built on contentEditable +
// document.execCommand rather than pulling in a full editor library, since
// the toolbar only needs to cover basic formatting, alignment, lists, a
// link, and a table skeleton. A source-view toggle covers everything the
// toolbar doesn't (e.g. hand-editing markup, or typing a {{placeholder}}
// that isn't obviously literal text in the visual view).
export default function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sourceMode, setSourceMode] = useState(false);

  // Only push `value` into the DOM when it didn't originate from this same
  // element's own onInput (i.e. it differs from what's already there) --
  // otherwise every keystroke would reset the cursor to the start.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  function handleInput() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    handleInput();
  }

  function insertLink() {
    const url = window.prompt('Link URL');
    if (url) exec('createLink', url);
  }

  function insertTable() {
    exec(
      'insertHTML',
      '<table style="width:100%;border-collapse:collapse;" border="1"><tbody>' +
        '<tr><td style="padding:6px;">&nbsp;</td><td style="padding:6px;">&nbsp;</td></tr>' +
        '<tr><td style="padding:6px;">&nbsp;</td><td style="padding:6px;">&nbsp;</td></tr>' +
        '</tbody></table><p><br></p>',
    );
  }

  // Toolbar buttons are mousedown-prevented so clicking one doesn't steal
  // focus/collapse the editor's text selection before the command runs.
  function preventBlur(e: React.MouseEvent) {
    e.preventDefault();
  }

  return (
    <div className="rte">
      <div className="rte-toolbar" onMouseDown={preventBlur}>
        {!sourceMode && (
          <>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) exec('formatBlock', e.target.value);
                e.target.value = '';
              }}
            >
              <option value="" disabled>
                Style
              </option>
              {BLOCKS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => exec('bold')} title="Bold">
              <b>B</b>
            </button>
            <button type="button" onClick={() => exec('italic')} title="Italic">
              <i>I</i>
            </button>
            <button type="button" onClick={() => exec('underline')} title="Underline">
              <u>U</u>
            </button>
            <button type="button" onClick={() => exec('justifyLeft')} title="Align left">
              ⯇
            </button>
            <button type="button" onClick={() => exec('justifyCenter')} title="Align center">
              ▬
            </button>
            <button type="button" onClick={() => exec('justifyRight')} title="Align right">
              ⯈
            </button>
            <button type="button" onClick={() => exec('insertUnorderedList')} title="Bullet list">
              • List
            </button>
            <button type="button" onClick={() => exec('insertOrderedList')} title="Numbered list">
              1. List
            </button>
            <button type="button" onClick={insertLink} title="Insert link">
              Link
            </button>
            <button type="button" onClick={insertTable} title="Insert table">
              Table
            </button>
          </>
        )}
        <button
          type="button"
          className={sourceMode ? 'rte-toolbar-active' : ''}
          onClick={() => setSourceMode((s) => !s)}
          title="View/edit HTML source"
          style={{ marginLeft: 'auto' }}
        >
          {'<>'}
        </button>
      </div>
      {sourceMode ? (
        <textarea className="rte-source" value={value} onChange={(e) => onChange(e.target.value)} rows={12} />
      ) : (
        <div
          ref={ref}
          className="rte-content"
          contentEditable
          onInput={handleInput}
          suppressContentEditableWarning
        />
      )}
    </div>
  );
}
