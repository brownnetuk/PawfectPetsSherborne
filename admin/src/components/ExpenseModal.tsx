import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import DateInput from './DateInput';
import Modal from './Modal';
import type { BankAccount, Expense, ExpenseCategoryOption, PaymentMethod, VendorOption } from '../types';
import { bankAccountTypeLabel } from '../utils/bankAccountType';
import {
  downloadReceipt,
  isAcceptedReceiptFile,
  isPdfReceipt,
  receiptExtension,
  receiptFileName,
} from '../utils/receiptFile';

interface Props {
  expense: Expense | null;
  // When set (and `expense` isn't), the form opens as a new expense prefilled
  // from this one, dated today and without its receipt.
  cloneFrom?: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}

const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

// The small round "+" beside the Payee and Category labels.
const addButtonStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: '50%',
  border: '1px solid var(--border)',
  background: '#fff',
  color: 'var(--brand-green)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
  fontWeight: 700,
};

function accountId(account: Expense['account']): string {
  if (!account) return '';
  return typeof account === 'string' ? account : account._id;
}

export default function ExpenseModal({ expense, cloneFrom, onClose, onSaved }: Props) {
  const source = expense ?? cloneFrom ?? null;
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [categories, setCategories] = useState<ExpenseCategoryOption[] | null>(null);
  const [vendors, setVendors] = useState<VendorOption[] | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[] | null>(null);
  const [date, setDate] = useState(expense ? expense.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(source?.category ?? '');
  const [payee, setPayee] = useState(source?.payee ?? '');
  const [paymentMethod, setPaymentMethod] = useState(source?.paymentMethod ?? '');
  const [reference, setReference] = useState(source?.reference ?? '');
  const [description, setDescription] = useState(source?.description ?? '');
  const [amount, setAmount] = useState(source ? String(source.amount) : '');
  const [account, setAccount] = useState(source ? accountId(source.account) : '');
  const [receipt, setReceipt] = useState(expense?.receipt ?? '');
  // Extension to keep when the receipt is renamed to Date-Payee-Amount on save.
  const [receiptExt, setReceiptExt] = useState(() =>
    expense?.receipt ? receiptExtension(expense.receiptName, expense.receipt) : '',
  );
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAddPayee, setShowAddPayee] = useState(false);
  const [newPayeeName, setNewPayeeName] = useState('');
  const [addPayeeBusy, setAddPayeeBusy] = useState(false);
  const [addPayeeError, setAddPayeeError] = useState<string | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addCategoryBusy, setAddCategoryBusy] = useState(false);
  const [addCategoryError, setAddCategoryError] = useState<string | null>(null);

  useEffect(() => {
    api.listBankAccounts().then((list) => {
      setAccounts(list);
      // Only pre-select on a brand-new expense -- an existing or cloned one
      // keeps whatever it was recorded against, same reasoning as the payment
      // method default below.
      if (!source) {
        const defaultAccount = list.find((a) => a.isDefault);
        if (defaultAccount) setAccount((cur) => cur || defaultAccount._id);
      }
    });
    api.listExpenseCategories().then((list) => {
      setCategories(list);
      if (list.length > 0) setCategory((cur) => cur || list[0].name);
    });
    api.listVendors().then(setVendors);
    api.listPaymentMethods().then((list) => {
      setPaymentMethods(list);
      // Only pre-select on a brand-new expense -- an existing one keeps
      // whatever it was recorded with, same as DocumentFormModal's default
      // invoice term only applying when there's no existing document.
      if (!source) {
        const defaultMethod = list.find((m) => m.isDefault);
        if (defaultMethod) setPaymentMethod((cur) => cur || defaultMethod.name);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddPayee() {
    const name = newPayeeName.trim();
    if (!name) return;
    setAddPayeeBusy(true);
    setAddPayeeError(null);
    try {
      const vendor = await api.createVendor({ name });
      setVendors((prev) => [...(prev ?? []), vendor]);
      setPayee(vendor.name);
      setNewPayeeName('');
      setShowAddPayee(false);
    } catch (err) {
      setAddPayeeError(err instanceof Error ? err.message : 'Failed to add this payee');
    } finally {
      setAddPayeeBusy(false);
    }
  }

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setAddCategoryBusy(true);
    setAddCategoryError(null);
    try {
      const created = await api.createExpenseCategory({ name });
      setCategories((prev) => [...(prev ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
      setCategory(created.name);
      setNewCategoryName('');
      setShowAddCategory(false);
    } catch (err) {
      setAddCategoryError(err instanceof Error ? err.message : 'Failed to add this category');
    } finally {
      setAddCategoryBusy(false);
    }
  }

  function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setReceiptError(null);
    if (!isAcceptedReceiptFile(file)) {
      setReceiptError('Please choose an image (JPG or PNG) or a PDF.');
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setReceiptError('That receipt is too large — please use one under 4MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let dataUri = reader.result as string;
      // Some browsers report a blank type for PDFs, which reads as
      // application/octet-stream -- relabel it so it displays as a PDF.
      if (/\.pdf$/i.test(file.name) && !isPdfReceipt(dataUri)) {
        dataUri = dataUri.replace(/^data:[^;,]*/, 'data:application/pdf');
      }
      setReceipt(dataUri);
      setReceiptExt(receiptExtension(file.name, dataUri));
    };
    reader.onerror = () => setReceiptError('Failed to read that file.');
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        date,
        category,
        // On an edit, cleared fields are sent blank (null for the account,
        // which must otherwise be an id) so clearing them actually clears
        // them -- left out, the update just keeps the old value.
        payee: expense ? payee : payee || undefined,
        paymentMethod: expense ? paymentMethod : paymentMethod || undefined,
        reference: reference.trim(),
        description: expense ? description.trim() : description.trim() || undefined,
        amount: Number(amount),
        account: expense ? account || null : account || undefined,
        // Sent blank on an edit so Remove actually clears the stored receipt.
        receipt: expense ? receipt : receipt || undefined,
        // Recomputed on every save so it follows any change to the date,
        // payee or amount.
        receiptName: receipt ? receiptFileName(date, payee, Number(amount), receiptExt) : expense ? '' : undefined,
      };
      if (expense) {
        await api.updateExpense(expense._id, input);
      } else {
        await api.createExpense(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this expense');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={expense ? 'Edit expense' : cloneFrom ? 'Clone expense' : 'New expense'} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Date *</label>
            <DateInput value={date} onChange={setDate} required autoFocus />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Category *</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddCategory((v) => !v);
                  setAddCategoryError(null);
                }}
                title="Add new category"
                aria-label="Add new category"
                style={addButtonStyle}
              >
                +
              </button>
            </label>
            {showAddCategory ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name"
                  autoFocus
                  style={{ flexGrow: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddCategory}
                  disabled={addCategoryBusy || !newCategoryName.trim()}
                >
                  {addCategoryBusy ? 'Adding…' : 'Add'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setShowAddCategory(false);
                    setNewCategoryName('');
                    setAddCategoryError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <select value={category} onChange={(e) => setCategory(e.target.value)} required>
                {!categories || categories.length === 0 ? (
                  <option value="">No categories set up</option>
                ) : (
                  categories.map((c) => (
                    <option key={c._id} value={c.name}>
                      {c.name}
                    </option>
                  ))
                )}
                {/* Keeps an existing expense's stored category selectable even if it's since
                    been renamed or removed from Settings > Finance. */}
                {category && !categories?.some((c) => c.name === category) && (
                  <option value={category}>{category}</option>
                )}
              </select>
            )}
            {addCategoryError && (
              <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: 4 }}>
                {addCategoryError}
              </div>
            )}
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Payee</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddPayee((v) => !v);
                  setAddPayeeError(null);
                }}
                title="Add new payee"
                aria-label="Add new payee"
                style={addButtonStyle}
              >
                +
              </button>
            </label>
            {showAddPayee ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={newPayeeName}
                  onChange={(e) => setNewPayeeName(e.target.value)}
                  placeholder="New payee name"
                  autoFocus
                  style={{ flexGrow: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddPayee}
                  disabled={addPayeeBusy || !newPayeeName.trim()}
                >
                  {addPayeeBusy ? 'Adding…' : 'Add'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setShowAddPayee(false);
                    setNewPayeeName('');
                    setAddPayeeError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <select value={payee} onChange={(e) => setPayee(e.target.value)}>
                <option value="">No payee</option>
                {vendors?.map((v) => (
                  <option key={v._id} value={v.name}>
                    {v.name}
                  </option>
                ))}
                {/* Keeps an existing expense's stored payee selectable even if it's since
                    been renamed or removed from Settings > Finance. */}
                {payee && !vendors?.some((v) => v.name === payee) && <option value={payee}>{payee}</option>}
              </select>
            )}
            {addPayeeError && (
              <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: 4 }}>
                {addPayeeError}
              </div>
            )}
          </div>
          <div className="field">
            <label>Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="">No payment method</option>
              {paymentMethods?.map((m) => (
                <option key={m._id} value={m.name}>
                  {m.name}
                </option>
              ))}
              {/* Keeps an existing expense's stored method selectable even if it's since
                  been renamed or removed from Settings > Finance. */}
              {paymentMethod && !paymentMethods?.some((m) => m.name === paymentMethod) && (
                <option value={paymentMethod}>{paymentMethod}</option>
              )}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Reference</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. invoice or order number"
          />
        </div>
        <div className="field">
          <label>Description</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Amount (£) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <div className="field">
            <label>Account</label>
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">No account</option>
              {accounts?.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} ({bankAccountTypeLabel(a.type)})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Receipt</label>
          {receipt ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {isPdfReceipt(receipt) ? (
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    color: 'var(--muted)',
                    flexShrink: 0,
                  }}
                >
                  PDF
                </div>
              ) : (
                <img
                  src={receipt}
                  alt="Receipt"
                  style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', wordBreak: 'break-all' }} title="Saved with this name">
                  {receiptFileName(date, payee, Number(amount), receiptExt)}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => downloadReceipt(receipt, receiptFileName(date, payee, Number(amount), receiptExt))}
                  >
                    Download
                  </button>
                  <button type="button" className="btn-link" onClick={() => setReceipt('')}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* The native file input is hidden behind a branded button --
                  its own grey "Choose File" control doesn't match the app. */}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => receiptInputRef.current?.click()}>
                Upload receipt
              </button>
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/jpeg,image/png,image/*,application/pdf,.pdf"
                onChange={handleReceiptChange}
                style={{ display: 'none' }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>JPG, PNG or PDF, up to 4MB</span>
            </div>
          )}
          {receiptError && (
            <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: 4 }}>
              {receiptError}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !category}>
            {submitting ? 'Saving…' : expense ? 'Save changes' : 'Create expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
