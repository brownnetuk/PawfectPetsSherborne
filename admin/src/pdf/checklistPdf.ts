import type { jsPDF } from 'jspdf';
import {
  BODY,
  BLUE,
  BrandPdfWriter,
  drawTick,
  fieldRowBlock,
  INK,
  INNER_WIDTH,
  INNER_X,
  MUTED,
  RULE,
  setFont,
  signatureBlock,
  spacerBlock,
  type Block,
} from './brandPdf';
import type { ChecklistAssignment } from '../types';

const FIELD_LABEL_WIDTH = 110;

function fieldBlock(doc: jsPDF, label: string, value: string): Block {
  return fieldRowBlock(doc, label, value, FIELD_LABEL_WIDTH);
}

// One checklist item -- a drawn checkbox (ticked in blue if completed)
// beside the item text, with who completed it as a muted note underneath.
function checklistItemBlock(doc: jsPDF, item: string, completed: boolean, completedBy: string | null): Block {
  const textX = INNER_X + 20;
  const leading = 12.5;
  setFont(doc, BODY, completed ? 'normal' : 'bold');
  doc.setFontSize(9.5);
  const lines = doc.splitTextToSize(item, INNER_WIDTH - 20) as string[];
  const subHeight = completed && completedBy ? 12 : 0;
  const height = 6 + Math.max(1, lines.length) * leading + subHeight + 4;
  return {
    height,
    draw(doc, y) {
      const baseline = y + 6 + 9;
      const box = 11;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...(completed ? BLUE : MUTED));
      doc.setLineWidth(1);
      doc.roundedRect(INNER_X, baseline - 9, box, box, 2.5, 2.5, 'FD');
      if (completed) drawTick(doc, INNER_X + 1.5, baseline, BLUE);
      setFont(doc, BODY, completed ? 'normal' : 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...(completed ? MUTED : INK));
      lines.forEach((line, i) => doc.text(line, textX, baseline + i * leading));
      if (completed && completedBy) {
        setFont(doc, BODY, 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(`Completed by ${completedBy}`, textX, baseline + (lines.length - 1) * leading + 12);
      }
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.75);
      doc.line(INNER_X, y + height - 0.5, INNER_X + INNER_WIDTH, y + height - 0.5);
    },
  };
}

function fullDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// The blocks for one checklist assignment's section (items, notes, sign-off)
// -- shared by the single-checklist export and the combined multi-checklist
// one below, so both stay in sync. `doc` is needed to measure wrapped text
// height at block-construction time (before anything is actually drawn).
function assignmentBlocks(doc: jsPDF, assignment: ChecklistAssignment): Block[] {
  const blocks: Block[] = [];
  if (assignment.completeByTime) {
    blocks.push(fieldBlock(doc, 'Complete by', assignment.completeByTime));
    blocks.push(spacerBlock(2));
  }
  assignment.items.forEach((item, i) => {
    blocks.push(checklistItemBlock(doc, item, !!assignment.completed[i], assignment.completedBy[i] ?? null));
  });
  if (assignment.notes) {
    blocks.push(spacerBlock(10));
    blocks.push(fieldBlock(doc, 'Notes', assignment.notes));
  }
  if (assignment.signatureImage) {
    blocks.push(spacerBlock(10));
    const signedOn = assignment.signedAt ? ` on ${new Date(assignment.signedAt).toLocaleString('en-GB')}` : '';
    blocks.push(signatureBlock(assignment.signatureImage, `Signed by ${assignment.signedBy ?? 'staff'}${signedOn}`));
  }
  return blocks;
}

/** Renders one day's checklist assignment (items, notes, sign-off) as a branded PDF. */
export async function buildChecklistPdf(assignment: ChecklistAssignment): Promise<jsPDF> {
  const w = new BrandPdfWriter();
  await w.init();
  w.drawHeader({ title: 'Daily checklist', subtitle: fullDateLabel(assignment.date) });
  w.section(assignment.name, assignmentBlocks(w.doc, assignment));
  w.finish('');
  return w.doc;
}

/**
 * Renders several checklist assignments into ONE combined PDF, one section
 * per checklist -- used by "Export day" (every checklist on one day) and
 * "Export all" (every checklist currently loaded in the calendar view).
 * Each section title is prefixed with its own date so entries from
 * different days stay identifiable once combined.
 */
export async function buildChecklistsPdf(assignments: ChecklistAssignment[], subtitle: string): Promise<jsPDF> {
  const w = new BrandPdfWriter();
  await w.init();
  w.drawHeader({ title: 'Daily checklists', subtitle });
  const sorted = [...assignments].sort((a, b) => a.date.localeCompare(b.date));
  for (const assignment of sorted) {
    const dateLabel = new Date(assignment.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    w.section(`${assignment.name} — ${dateLabel}`, assignmentBlocks(w.doc, assignment));
  }
  w.finish('');
  return w.doc;
}
