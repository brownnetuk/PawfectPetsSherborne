import { useEffect, useRef, useState } from "react";
import * as api from "../api/client";
import { buildFormSubmissionPdf } from "../pdf/formSubmissionPdf";
import type {
  Animal,
  Customer,
  FormField,
  FormSubmissionRecord,
} from "../types";
import ActionsMenu from "./ActionsMenu";
import CustomerPicker from "./CustomerPicker";
import FormFillModal from "./FormFillModal";
import Modal from "./Modal";
import ViewFormSubmissionModal from "./ViewFormSubmissionModal";
import { formatUkDate } from "../utils/ukDate";

// Same bands and colours as a risk on a site risk assessment
// (RiskAssessmentDetailModal / riskAssessmentPdf.ts).
function scoreBand(score: number): "low" | "medium" | "high" {
  if (score <= 6) return "low";
  if (score <= 14) return "medium";
  return "high";
}
const BAND_COLORS: Record<"low" | "medium" | "high", string> = {
  low: "#2f8a57",
  medium: "#c98a00",
  high: "#d7385e",
};

// The likelihood, severity and score fields, found by label rather than by
// fixed id so they still work once staff have edited the form in
// Settings > Forms.
function ratingFields(fields: FormField[]) {
  return {
    likelihood: fields.find(
      (f) => f.type === "choice" && /likelihood/i.test(f.label),
    ),
    severity: fields.find(
      (f) => f.type === "choice" && /severity/i.test(f.label),
    ),
    score: fields.find((f) => f.type === "number" && /score/i.test(f.label)),
  };
}

// Fills the risk score in as likelihood × severity whenever both are picked
// (it stays editable, like the paper form's blank).
function deriveRiskScore(
  answers: Record<string, unknown>,
  fields: FormField[],
): Record<string, unknown> {
  const { likelihood, severity, score } = ratingFields(fields);
  if (!likelihood || !severity || !score) return answers;
  const l = Number(answers[likelihood.id]);
  const s = Number(answers[severity.id]);
  if (!l || !s) return answers;
  const product = String(l * s);
  return answers[score.id] === product
    ? answers
    : { ...answers, [score.id]: product };
}

// What a list row shows, read off the assessment's own fields by type/label.
function summarise(assessment: FormSubmissionRecord) {
  const fields: FormField[] = assessment.formFieldsSnapshot ?? [];
  const answers = assessment.answers ?? {};
  const answer = (field: FormField | undefined) =>
    field ? answers[field.id] : undefined;
  const asText = (value: unknown) =>
    (typeof value === "string" && value.trim()) || typeof value === "number"
      ? String(value)
      : undefined;
  const asList = (value: unknown) =>
    Array.isArray(value)
      ? (value as string[])
      : typeof value === "string" && value
        ? [value]
        : [];
  const asDate = (value: string | undefined) =>
    formatUkDate(value, "") || undefined;

  const dogs = asList(
    answer(
      fields.find(
        (f) =>
          (f.type === "multichoice" || f.type === "choice") &&
          f.optionsSource === "customerPets",
      ),
    ),
  );
  const arrival = asDate(
    asText(
      answer(fields.find((f) => f.type === "date" && /arriv/i.test(f.label))),
    ),
  );
  const assessedOn =
    // The date of assessment: a 'today' field on older assessments, otherwise
    // the date field that isn't the arrival date.
    asDate(
      asText(
        answer(
          fields.find((f) => f.type === "today") ??
            fields.find((f) => f.type === "date" && !/arriv/i.test(f.label)),
        ),
      ),
    ) ??
    asDate(assessment.submittedAt ?? undefined);
  const { likelihood, severity, score } = ratingFields(fields);
  const typedScore = Number(asText(answer(score)));
  const derivedScore =
    Number(asText(answer(likelihood))) * Number(asText(answer(severity)));
  const riskScore = typedScore || derivedScore || undefined;
  const assessedBy = asText(
    answer(
      fields.find((f) => f.type === "text" && /assessed by/i.test(f.label)),
    ),
  );
  const customerName =
    typeof assessment.customer === "object" && assessment.customer
      ? assessment.customer.name
      : assessment.recipientName;
  return { dogs, arrival, assessedOn, riskScore, assessedBy, customerName };
}

function customerIdOf(assessment: FormSubmissionRecord): string {
  const c = assessment.customer;
  return typeof c === "object" && c ? c._id : (c ?? "");
}

// The risk assessment fill form, with a customer picker above it that says
// which customer (and so which dogs) it's for. On a new one, picking a
// different customer restarts the form against them, so "Dog's name" lists
// their dogs; on an existing one, it re-links it there straight away.
function CustomerRiskAssessmentFillModal({
  initialCustomerId,
  lockCustomer,
  editSubmissionId,
  onClose,
  onChanged,
}: {
  initialCustomerId?: string;
  // On a customer's own page -- no picker, it's for them.
  lockCustomer?: boolean;
  editSubmissionId?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const editing = !!editSubmissionId;
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [submissionId, setSubmissionId] = useState<string | null>(
    editSubmissionId ?? null,
  );
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the new assessment has been submitted -- one closed without
  // submitting is discarded rather than left pending.
  const submitted = useRef(false);

  useEffect(() => {
    Promise.all([api.listCustomers(), api.listAnimals()])
      .then(([c, a]) => {
        setCustomers(c);
        setAnimals(a);
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load customers",
        ),
      );
  }, []);

  // A new assessment's pending submission is created once a customer is chosen.
  useEffect(() => {
    if (editing || !customerId || submissionId) return;
    let cancelled = false;
    api
      .createCustomerRiskAssessment(customerId)
      .then((s) => {
        if (cancelled) api.deleteCustomerRiskAssessment(s._id).catch(() => {});
        else setSubmissionId(s._id);
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Failed to start a risk assessment",
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [editing, customerId, submissionId]);

  function discardPending() {
    if (!editing && !submitted.current && submissionId) {
      api.deleteCustomerRiskAssessment(submissionId).catch(() => {});
    }
  }

  async function handlePickCustomer(next: string) {
    if (!next || next === customerId) return;
    setError(null);
    if (!editing) {
      discardPending();
      setSubmissionId(null);
      setCustomerId(next);
      return;
    }
    setSwitching(true);
    try {
      await api.moveCustomerRiskAssessment(submissionId!, next);
      setCustomerId(next);
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to link the risk assessment to that customer",
      );
    } finally {
      setSwitching(false);
    }
  }

  function handleClose() {
    discardPending();
    onClose();
  }

  // Only a customer with just the one dog gets it pre-ticked -- otherwise
  // staff say which dog(s) this intake is for.
  const customerDogs = animals
    .filter((a) => a.customer === customerId)
    .map((a) => a.name);
  const title = editing
    ? "Edit customer risk assessment"
    : "Customer risk assessment";
  const picker = lockCustomer ? (
    error && <div className="error-banner">{error}</div>
  ) : (
    <>
      <div className="field">
        <label>
          Customer <span style={{ color: "var(--error)" }}>*</span>
        </label>
        {customers ? (
          switching ? (
            <p>Linking…</p>
          ) : (
            <CustomerPicker
              customers={customers}
              animals={animals}
              value={customerId}
              onChange={handlePickCustomer}
            />
          )
        ) : (
          <p>Loading customers…</p>
        )}
        <div className="hint">
          {editing
            ? "Changing this links the risk assessment to that customer straight away -- save any other changes first."
            : 'Links the risk assessment to the customer -- "Dog\'s name" lists their dogs.'}
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
    </>
  );

  if (!customerId || !submissionId) {
    return (
      <Modal title={title} onClose={handleClose} wide>
        {picker}
        {customerId && !error && <p>Loading…</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
          >
            Cancel
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <FormFillModal
      // Remounted per customer, so the form reloads with that customer's dogs.
      key={`${submissionId}:${customerId}`}
      submissionId={submissionId}
      title={title}
      header={picker}
      presetPetNames={customerDogs.length === 1 ? customerDogs : undefined}
      deriveAnswers={deriveRiskScore}
      saveEdit={
        editing
          ? async (answers) => {
              await api.updateCustomerRiskAssessment(submissionId, answers);
            }
          : undefined
      }
      onClose={handleClose}
      onSubmitted={() => {
        submitted.current = true;
        onChanged();
      }}
    />
  );
}

// Completed customer risk assessments (the "New Dog Intake Risk Assessment"
// form, or whichever Settings > Boarding picks -- see backend
// CustomerRiskAssessmentsService). Every customer's under Risk Assessments,
// or one customer's on their Forms tab when given `customerId`.
export default function CustomerRiskAssessmentsCard({
  customerId,
  onOpenCustomer,
}: {
  customerId?: string;
  onOpenCustomer?: (customerId: string) => void;
}) {
  const [assessments, setAssessments] = useState<FormSubmissionRecord[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  // 'new' = adding, otherwise the assessment being edited.
  const [filling, setFilling] = useState<FormSubmissionRecord | "new" | null>(
    null,
  );
  const [viewing, setViewing] = useState<FormSubmissionRecord | null>(null);
  const [confirmDelete, setConfirmDelete] =
    useState<FormSubmissionRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function refresh() {
    api
      .listCustomerRiskAssessments(customerId)
      .then(setAssessments)
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load customer risk assessments",
        ),
      );
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [customerId]);

  async function pdfFor(assessment: FormSubmissionRecord) {
    const full = await api.getFormSubmission(assessment._id);
    const { dogs } = summarise(assessment);
    const name =
      `${[full.formName, dogs.join(", ")].filter(Boolean).join(" - ")}.pdf`.replace(
        /[/\\]/g,
        "-",
      );
    return { doc: await buildFormSubmissionPdf(full), name };
  }

  async function handleExportPdf(assessment: FormSubmissionRecord) {
    setError(null);
    try {
      const { doc, name } = await pdfFor(assessment);
      doc.save(name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate the PDF",
      );
    }
  }

  async function handleEmail(assessment: FormSubmissionRecord) {
    setError(null);
    setNotice(null);
    try {
      const { doc, name } = await pdfFor(assessment);
      await api.sendFormSubmissionCopy(
        assessment._id,
        doc.output("datauristring"),
        name,
      );
      setNotice(`Emailed a copy to ${assessment.recipientEmail}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to email the risk assessment",
      );
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteCustomerRiskAssessment(confirmDelete._id);
      setConfirmDelete(null);
      refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete that risk assessment",
      );
    } finally {
      setDeleting(false);
    }
  }

  const showCustomer = !customerId;

  const table = !assessments ? (
    <div className="empty-state">Loading…</div>
  ) : assessments.length === 0 ? (
    <div className="empty-state">No customer risk assessments yet.</div>
  ) : (
    <table>
      <thead>
        <tr>
          {showCustomer && <th>Customer</th>}
          <th>Dog(s)</th>
          <th>Arrival Date</th>
          <th>Risk Score</th>
          <th>Assessed By</th>
          <th>Date Assessed</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {assessments.map((assessment) => {
          const {
            dogs,
            arrival,
            assessedOn,
            riskScore,
            assessedBy,
            customerName,
          } = summarise(assessment);
          const band = riskScore ? scoreBand(riskScore) : null;
          return (
            <tr
              key={assessment._id}
              onDoubleClick={() => setViewing(assessment)}
              style={{ cursor: "pointer" }}
            >
              {showCustomer && (
                <td onDoubleClick={(e) => e.stopPropagation()}>
                  {onOpenCustomer ? (
                    <button
                      className="btn-link"
                      onClick={() => onOpenCustomer(customerIdOf(assessment))}
                    >
                      {customerName ?? "—"}
                    </button>
                  ) : (
                    (customerName ?? "—")
                  )}
                </td>
              )}
              <td>
                <strong>{dogs.length > 0 ? dogs.join(", ") : "—"}</strong>
              </td>
              <td>{arrival ?? "—"}</td>
              <td>
                {riskScore && band ? (
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      borderRadius: 999,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#fff",
                      background: BAND_COLORS[band],
                    }}
                  >
                    {riskScore} - {band.toUpperCase()}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td>{assessedBy ?? "—"}</td>
              <td>{assessedOn ?? "—"}</td>
              <td
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <ActionsMenu
                  items={[
                    { label: "View", onClick: () => setViewing(assessment) },
                    { label: "Edit", onClick: () => setFilling(assessment) },
                    {
                      label: "Export to PDF",
                      onClick: () => handleExportPdf(assessment),
                    },
                    {
                      label: "Email to customer",
                      onClick: () => handleEmail(assessment),
                    },
                    {
                      label: "Delete",
                      onClick: () => setConfirmDelete(assessment),
                      danger: true,
                      dividerBefore: true,
                    },
                  ]}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  const messages = (
    <>
      {error && <div className="error-banner">{error}</div>}
      {notice && (
        <div
          style={{
            color: "var(--brand-green)",
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          {notice}
        </div>
      )}
    </>
  );
  const addButton = (
    <button
      className={showCustomer ? "btn btn-primary" : "btn btn-secondary"}
      onClick={() => setFilling("new")}
    >
      + New Customer Risk Assessment
    </button>
  );

  return (
    <div>
      {showCustomer ? (
        <>
          <div className="page-header" style={{ marginTop: 32 }}>
            <h1>Customer Risk Assessments</h1>
            {addButton}
          </div>
          <p
            style={{
              color: "var(--muted)",
              fontSize: "0.88rem",
              marginTop: -8,
            }}
          >
            A New Dog Intake Risk Assessment for each customer's dog(s).
            Double-click a row to view it.
          </p>
          {messages}
          <div className="card" style={{ padding: 0 }}>
            {table}
          </div>
        </>
      ) : (
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div>
              <h2>Risk assessments</h2>
              <p
                style={{
                  color: "var(--muted)",
                  fontSize: "0.88rem",
                  marginTop: -6,
                }}
              >
                New Dog Intake Risk Assessments for this customer's dogs.
                Double-click a row to view it.
              </p>
            </div>
            {addButton}
          </div>
          {messages}
          {table}
        </div>
      )}

      {filling && (
        <CustomerRiskAssessmentFillModal
          initialCustomerId={
            filling === "new" ? customerId : customerIdOf(filling)
          }
          lockCustomer={!!customerId}
          editSubmissionId={filling === "new" ? undefined : filling._id}
          onClose={() => {
            setFilling(null);
            refresh();
          }}
          onChanged={refresh}
        />
      )}
      {viewing && (
        <ViewFormSubmissionModal
          submission={viewing}
          onClose={() => setViewing(null)}
        />
      )}
      {confirmDelete && (
        <Modal
          title="Delete this risk assessment?"
          onClose={() => setConfirmDelete(null)}
        >
          <p>
            This removes the risk assessment from the customer's
            forms. It goes to the Recycle Bin in Settings, where it can be restored.
          </p>
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
