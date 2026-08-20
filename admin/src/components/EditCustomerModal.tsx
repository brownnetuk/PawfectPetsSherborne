import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { Customer } from '../types';

interface Props {
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditCustomerModal({ customer, onClose, onSaved }: Props) {
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email);
  const [address, setAddress] = useState(customer.address ?? '');
  const [telephone, setTelephone] = useState(customer.telephone ?? '');
  const [mobile, setMobile] = useState(customer.mobile ?? '');

  const [sameAsClient, setSameAsClient] = useState(customer.emergencyContact?.sameAsClient ?? false);
  const [ecName, setEcName] = useState(customer.emergencyContact?.name ?? '');
  const [ecAddress, setEcAddress] = useState(customer.emergencyContact?.address ?? '');
  const [ecTelephone, setEcTelephone] = useState(customer.emergencyContact?.telephone ?? '');
  const [ecMobile, setEcMobile] = useState(customer.emergencyContact?.mobile ?? '');
  const [ecEmail, setEcEmail] = useState(customer.emergencyContact?.email ?? '');

  const [vetPractice, setVetPractice] = useState(customer.emergencyVet?.practiceName ?? '');
  const [vetAddress, setVetAddress] = useState(customer.emergencyVet?.address ?? '');
  const [vetTelephone, setVetTelephone] = useState(customer.emergencyVet?.telephone ?? '');
  const [vetEmail, setVetEmail] = useState(customer.emergencyVet?.email ?? '');
  const [vetAuthorised, setVetAuthorised] = useState(
    customer.emergencyVet?.alternativeVetAuthorised ?? false,
  );

  const [keysProvided, setKeysProvided] = useState(customer.security?.keysProvided ?? false);
  const [alarmInstructions, setAlarmInstructions] = useState('');
  const [furtherInformation, setFurtherInformation] = useState(
    customer.security?.furtherInformation ?? '',
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sameAsClient && (!ecTelephone && !ecMobile)) {
      setError('Emergency contact requires at least one of telephone or mobile.');
      return;
    }
    if (!sameAsClient && (!ecName || !ecAddress)) {
      setError('Emergency contact name and address are required unless "same as client".');
      return;
    }
    if (!vetAuthorised) {
      setError('Alternative vet care authorisation must be acknowledged.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.updateCustomer(customer._id, {
        name,
        email,
        address,
        telephone: telephone || undefined,
        mobile,
        emergencyContact: {
          sameAsClient,
          name: sameAsClient ? undefined : ecName,
          address: sameAsClient ? undefined : ecAddress,
          telephone: ecTelephone || undefined,
          mobile: ecMobile || undefined,
          email: ecEmail || undefined,
        },
        emergencyVet: {
          practiceName: vetPractice,
          address: vetAddress,
          telephone: vetTelephone,
          email: vetEmail || undefined,
          alternativeVetAuthorised: vetAuthorised,
        },
        security: {
          keysProvided,
          // Omitted entirely (not sent as '') when left blank, so the backend
          // knows to leave the existing encrypted alarm code untouched.
          ...(alarmInstructions ? { alarmInstructions } : {}),
          furtherInformation: furtherInformation || undefined,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Edit customer" onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="section-title">Client details</div>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Mobile</label>
            <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} required />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Telephone</label>
            <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </div>
          <div className="field">
            <label>Address</label>
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} required />
          </div>
        </div>

        <div className="section-title">Emergency contact</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 400 }}>
          <input type="checkbox" checked={sameAsClient} onChange={(e) => setSameAsClient(e.target.checked)} />
          Same as client
        </label>
        {!sameAsClient && (
          <div className="field-row">
            <div className="field">
              <label>Name</label>
              <input type="text" value={ecName} onChange={(e) => setEcName(e.target.value)} />
            </div>
            <div className="field">
              <label>Address</label>
              <textarea value={ecAddress} onChange={(e) => setEcAddress(e.target.value)} />
            </div>
          </div>
        )}
        <div className="field-row">
          <div className="field">
            <label>Telephone</label>
            <input type="tel" value={ecTelephone} onChange={(e) => setEcTelephone(e.target.value)} />
          </div>
          <div className="field">
            <label>Mobile</label>
            <input type="tel" value={ecMobile} onChange={(e) => setEcMobile(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={ecEmail} onChange={(e) => setEcEmail(e.target.value)} />
        </div>

        <div className="section-title">Emergency vet</div>
        <div className="field-row">
          <div className="field">
            <label>Practice</label>
            <input type="text" value={vetPractice} onChange={(e) => setVetPractice(e.target.value)} required />
          </div>
          <div className="field">
            <label>Address</label>
            <textarea value={vetAddress} onChange={(e) => setVetAddress(e.target.value)} required />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Telephone</label>
            <input type="tel" value={vetTelephone} onChange={(e) => setVetTelephone(e.target.value)} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={vetEmail} onChange={(e) => setVetEmail(e.target.value)} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={vetAuthorised}
            onChange={(e) => setVetAuthorised(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          Authorised to arrange alternative veterinary care if usual vet is unobtainable
        </label>

        <div className="section-title">Security</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 400 }}>
          <input type="checkbox" checked={keysProvided} onChange={(e) => setKeysProvided(e.target.checked)} />
          Keys provided
        </label>
        <div className="field">
          <label>Alarm instructions</label>
          <input
            type="text"
            value={alarmInstructions}
            onChange={(e) => setAlarmInstructions(e.target.value)}
            placeholder={customer.security ? 'Leave blank to keep existing code unchanged' : ''}
          />
        </div>
        <div className="field">
          <label>Further information</label>
          <textarea value={furtherInformation} onChange={(e) => setFurtherInformation(e.target.value)} />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
