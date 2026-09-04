import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const BLOCKS = [
  { value: 'p', label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
];

// Web-safe only -- these are the handful of fonts that render as requested
// (rather than silently falling back) across the mail clients this app's
// emails actually get opened in.
const FONTS = [
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: "'Georgia', serif", label: 'Georgia' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
];

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40];

export interface RichTextEditorHandle {
  /** Inserts text at the current cursor position (falls back to the end if nothing's focused/selected). */
  insertText: (text: string) => void;
}

// Minimal WYSIWYG editor for template bodies that are stored/sent as raw
// HTML (currently the Invoice/Quote templates) -- built on contentEditable +
// document.execCommand rather than pulling in a full editor library, since
// the toolbar only needs to cover basic formatting, alignment, lists, a
// link, and a table skeleton. A source-view toggle covers everything the
// toolbar doesn't (e.g. hand-editing markup, or typing a {{placeholder}}
// that isn't obviously literal text in the visual view).
const RichTextEditor = forwardRef<RichTextEditorHandle, { value: string; onChange: (html: string) => void }>(
  function RichTextEditor({ value, onChange }, forwardedRef) {
    const ref = useRef<HTMLDivElement>(null);
    const sourceRef = useRef<HTMLTextAreaElement>(null);
    const [sourceMode, setSourceMode] = useState(false);

    // Only push `value` into the DOM when it didn't originate from this same
    // element's own onInput (i.e. it differs from what's already there) --
    // otherwise every keystroke would reset the cursor to the start. Also
    // re-runs on sourceMode: the content div unmounts while source view is
    // showing (a fresh, empty one is mounted when switching back), and since
    // `value` itself didn't change in that case, only depending on `value`
    // would leave that fresh div permanently blank.
    useEffect(() => {
      if (!ref.current) return;
      if (ref.current.innerHTML !== value) {
        ref.current.innerHTML = value;
      }
      // A block-level structure (e.g. a styled "card" div) can fill the
      // entire editor with no actual node below it to click into -- without
      // a trailing empty block, clicking in that space doesn't reliably
      // place a cursor anywhere. Not synced back to `value` unless staff
      // actually type into it; re-added on every load either way.
      const last = ref.current.lastElementChild;
      const lastIsEmptyBlock =
        last && /^(P|DIV)$/i.test(last.tagName) && (last.innerHTML === '' || last.innerHTML === '<br>');
      if (!lastIsEmptyBlock) {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        ref.current.appendChild(p);
      }
    }, [value, sourceMode]);

    function handleInput() {
      if (ref.current) onChange(ref.current.innerHTML);
    }

    function exec(command: string, arg?: string) {
      ref.current?.focus();
      document.execCommand(command, false, arg);
      handleInput();
    }

    function focusAtEnd() {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    // Clicking below the last rendered block lands directly on the
    // contentEditable container (there's no child element that far down) --
    // without this, that click does nothing, which looks like the editor
    // won't let you click "into the white space at the end". But a drag-
    // selection's mouseup can *also* land on the container itself (e.g.
    // releasing in the gap between two lines rather than exactly on a
    // character) -- collapsing to the end in that case would wipe out the
    // selection the instant it's made, so this only fires when there's no
    // real selection to preserve.
    function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
      if (e.target !== ref.current) return;
      if (!window.getSelection()?.isCollapsed) return;
      focusAtEnd();
    }

    useImperativeHandle(forwardedRef, () => ({
      insertText(text: string) {
        if (sourceMode && sourceRef.current) {
          const ta = sourceRef.current;
          const start = ta.selectionStart ?? value.length;
          const end = ta.selectionEnd ?? value.length;
          const next = value.slice(0, start) + text + value.slice(end);
          onChange(next);
          requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(start + text.length, start + text.length);
          });
        } else if (ref.current) {
          // If focus isn't already inside the editor (e.g. it just came from
          // a toolbar dropdown), there's no meaningful "current cursor" --
          // insert at the end instead of wherever focus happened to last be.
          if (document.activeElement !== ref.current) focusAtEnd();
          document.execCommand('insertText', false, text);
          handleInput();
        }
      },
    }));

    function insertLink() {
      const url = window.prompt('Link URL');
      if (url) exec('createLink', url);
    }

    function insertTable() {
      // Focus the editor first: the Table dropdown steals focus, so without
      // this insertHTML has no caret to insert at.
      if (document.activeElement !== ref.current) focusAtEnd();
      else ref.current?.focus();
      document.execCommand(
        'insertHTML',
        false,
        '<table style="width:100%;border-collapse:collapse;" border="1"><tbody>' +
          '<tr><td style="padding:6px;">&nbsp;</td><td style="padding:6px;">&nbsp;</td></tr>' +
          '<tr><td style="padding:6px;">&nbsp;</td><td style="padding:6px;">&nbsp;</td></tr>' +
          '</tbody></table><p><br></p>',
      );
      handleInput();
    }

    // --- table cell editing (operates on the cell containing the caret) ---

    function currentCell(): HTMLTableCellElement | null {
      let node = window.getSelection()?.anchorNode ?? null;
      while (node && node !== ref.current) {
        if (node instanceof HTMLElement && (node.tagName === 'TD' || node.tagName === 'TH')) {
          return node as HTMLTableCellElement;
        }
        node = node.parentNode;
      }
      return null;
    }

    function newCell(): HTMLTableCellElement {
      const td = document.createElement('td');
      td.style.padding = '6px';
      td.innerHTML = '&nbsp;';
      return td;
    }

    function withCell(
      fn: (cell: HTMLTableCellElement, row: HTMLTableRowElement, table: HTMLTableElement) => void,
    ) {
      const cell = currentCell();
      const row = cell?.parentElement as HTMLTableRowElement | undefined;
      const table = cell?.closest('table') as HTMLTableElement | null;
      if (!cell || !row || !table) {
        window.alert('Put the cursor inside a table cell first.');
        return;
      }
      fn(cell, row, table);
      handleInput();
    }

    function tableAddRow(after: boolean) {
      withCell((_cell, row) => {
        const tr = document.createElement('tr');
        for (let i = 0; i < row.cells.length; i++) tr.appendChild(newCell());
        row.parentElement!.insertBefore(tr, after ? row.nextSibling : row);
      });
    }

    function tableDeleteRow() {
      withCell((_cell, row, table) => {
        if (table.rows.length <= 1) return;
        row.remove();
      });
    }

    function tableAddColumn(after: boolean) {
      withCell((cell, _row, table) => {
        const idx = cell.cellIndex;
        Array.from(table.rows).forEach((r) => {
          const target = r.cells[idx] ?? null;
          r.insertBefore(newCell(), after ? (target ? target.nextSibling : null) : target);
        });
      });
    }

    function tableDeleteColumn() {
      withCell((cell, row, table) => {
        if (row.cells.length <= 1) return;
        const idx = cell.cellIndex;
        Array.from(table.rows).forEach((r) => {
          if (r.cells[idx]) r.deleteCell(idx);
        });
      });
    }

    function absorb(into: HTMLTableCellElement, from: HTMLTableCellElement) {
      const extra = from.innerHTML.trim();
      if (extra && extra !== '&nbsp;') into.innerHTML += ` ${from.innerHTML}`;
    }

    function tableMergeRight() {
      withCell((cell) => {
        const next = cell.nextElementSibling as HTMLTableCellElement | null;
        if (!next) return;
        cell.colSpan = (cell.colSpan || 1) + (next.colSpan || 1);
        absorb(cell, next);
        next.remove();
      });
    }

    function tableMergeDown() {
      withCell((cell, row) => {
        const idx = cell.cellIndex;
        const nextRow = row.nextElementSibling as HTMLTableRowElement | null;
        const below = nextRow?.cells[idx];
        if (!below) return;
        cell.rowSpan = (cell.rowSpan || 1) + (below.rowSpan || 1);
        absorb(cell, below);
        below.remove();
      });
    }

    function tableSplitCell() {
      withCell((cell, row, _table) => {
        const cs = cell.colSpan || 1;
        const rs = cell.rowSpan || 1;
        cell.colSpan = 1;
        cell.rowSpan = 1;
        // Re-add the blank cells the merge had absorbed.
        for (let i = 1; i < cs; i++) row.insertBefore(newCell(), cell.nextSibling);
        if (rs > 1) {
          const idx = cell.cellIndex;
          let r = row.nextElementSibling as HTMLTableRowElement | null;
          for (let k = 1; k < rs && r; k++) {
            r.insertBefore(newCell(), r.cells[idx] ?? null);
            r = r.nextElementSibling as HTMLTableRowElement | null;
          }
        }
      });
    }

    function tableAction(action: string) {
      switch (action) {
        case 'insert': return insertTable();
        case 'rowAbove': return tableAddRow(false);
        case 'rowBelow': return tableAddRow(true);
        case 'delRow': return tableDeleteRow();
        case 'colLeft': return tableAddColumn(false);
        case 'colRight': return tableAddColumn(true);
        case 'delCol': return tableDeleteColumn();
        case 'mergeRight': return tableMergeRight();
        case 'mergeDown': return tableMergeDown();
        case 'split': return tableSplitCell();
      }
    }

    // execCommand has no direct "set this px font-size" command -- only the
    // legacy 1-7 scale, which old <font size> tags represent poorly in email
    // clients. The standard workaround: apply a throwaway legacy size (7,
    // chosen because it's unlikely to already be in use), then swap every
    // <font size="7"> it just created for a <span style="font-size:...">.
    // Same trick for font family below, via <font face="__rte-face-marker">.
    function applyFontSize(px: string) {
      ref.current?.focus();
      document.execCommand('fontSize', false, '7');
      ref.current?.querySelectorAll('font[size="7"]').forEach((el) => {
        const span = document.createElement('span');
        span.style.fontSize = `${px}px`;
        span.innerHTML = el.innerHTML;
        el.replaceWith(span);
      });
      handleInput();
    }

    function applyFontFamily(family: string) {
      ref.current?.focus();
      document.execCommand('fontName', false, '__rte-face-marker');
      ref.current?.querySelectorAll('font[face="__rte-face-marker"]').forEach((el) => {
        const span = document.createElement('span');
        span.style.fontFamily = family;
        span.innerHTML = el.innerHTML;
        el.replaceWith(span);
      });
      handleInput();
    }

    function insertLine() {
      exec('insertHTML', '<hr style="border:none;border-top:1px solid #d1d5db;margin:16px 0;" />');
    }

    function insertBox() {
      exec(
        'insertHTML',
        '<div style="border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc;padding:16px 20px;margin:12px 0;">Box text</div><p><br></p>',
      );
    }

    function insertButton() {
      const label = window.prompt('Button text', 'Click here');
      if (!label) return;
      const url = window.prompt('Button link URL', 'https://');
      if (!url) return;
      exec(
        'insertHTML',
        `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;background:#0f3a5f;color:#ffffff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;">${label}</a>&nbsp;`,
      );
    }

    // Toolbar buttons are mousedown-prevented so clicking one doesn't steal
    // focus/collapse the editor's text selection before the command runs --
    // but NOT for the select/color-input controls in the toolbar, since
    // calling preventDefault() on a <select>'s mousedown blocks Chromium
    // from ever opening its native options list (the picker just silently
    // does nothing), and likewise breaks the color input's native swatch.
    function preventBlur(e: React.MouseEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'OPTION') return;
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
              <select
                defaultValue=""
                title="Font"
                onChange={(e) => {
                  if (e.target.value) applyFontFamily(e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>
                  Font
                </option>
                {FONTS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                defaultValue=""
                title="Font size"
                onChange={(e) => {
                  if (e.target.value) applyFontSize(e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>
                  Size
                </option>
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}px
                  </option>
                ))}
              </select>
              <input
                type="color"
                title="Text colour"
                className="rte-color-swatch"
                defaultValue="#1f3b2c"
                onChange={(e) => exec('foreColor', e.target.value)}
              />
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
              <button type="button" onClick={insertButton} title="Insert a button linking somewhere">
                Button
              </button>
              <select
                defaultValue=""
                title="Table"
                onChange={(e) => {
                  const v = e.target.value;
                  e.target.value = '';
                  if (v) tableAction(v);
                }}
              >
                <option value="" disabled>
                  Table
                </option>
                <option value="insert">Insert table</option>
                <option value="rowAbove">Add row above</option>
                <option value="rowBelow">Add row below</option>
                <option value="delRow">Delete row</option>
                <option value="colLeft">Add column left</option>
                <option value="colRight">Add column right</option>
                <option value="delCol">Delete column</option>
                <option value="mergeRight">Merge cell right</option>
                <option value="mergeDown">Merge cell down</option>
                <option value="split">Split cell</option>
              </select>
              <button type="button" onClick={insertBox} title="Insert a bordered box">
                Box
              </button>
              <button type="button" onClick={insertLine} title="Insert a horizontal line">
                Line
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
          <textarea
            ref={sourceRef}
            className="rte-source"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={12}
          />
        ) : (
          <div
            ref={ref}
            className="rte-content"
            contentEditable
            onInput={handleInput}
            onClick={handleContainerClick}
            suppressContentEditableWarning
          />
        )}
      </div>
    );
  },
);

export default RichTextEditor;
