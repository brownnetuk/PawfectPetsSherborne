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
  const [firstName, setFirstName] = useState(customer.firstName ?? '');
  const [surname, setSurname] = useState(customer.surname ?? '');
  const [email, setEmail] = useState(customer.email);
  const [address1, setAddress1] = useState(customer.address1 ?? '');
  const [address2, setAddress2] = useState(customer.address2 ?? '');
  const [town, setTown] = useState(customer.town ?? '');
  const [county, setCounty] = useState(customer.county ?? '');
  const [postcode, setPostcode] = useState(customer.postcode ?? '');
  const [phoneNumber, setPhoneNumber] = useState(customer.phoneNumber ?? '');

  const [sameAsClient, setSameAsClient] = useState(customer.emergencyContact?.sameAsClient ?? false);
  const [ecFirstName, setEcFirstName] = useState(customer.emergencyContact?.firstName ?? '');
  const [ecSurname, setEcSurname] = useState(customer.emergencyContact?.surname ?? '');
  const [ecAddress1, setEcAddress1] = useState(customer.emergencyContact?.address1 ?? '');
  const [ecAddress2, setEcAddress2] = useState(customer.emergencyContact?.address2 ?? '');
  const [ecTown, setEcTown] = useState(customer.emergencyContact?.town ?? '');
  const [ecCounty, setEcCounty] = useState(customer.emergencyContact?.county ?? '');
  const [ecPostcode, setEcPostcode] = useState(customer.emergencyContact?.postcode ?? '');
  const [ecPhoneNumber, setEcPhoneNumber] = useState(customer.emergencyContact?.phoneNumber ?? '');
  const [ecEmail, setEcEmail] = useState(customer.emergencyContact?.email ?? '');

  const [vetPractice, setVetPractice] = useState(customer.emergencyVet?.practiceName ?? '');
  const [vetAddress1, setVetAddress1] = useState(customer.emergencyVet?.address1 ?? '');
  const [vetAddress2, setVetAddress2] = useState(customer.emergencyVet?.address2 ?? '');
  const [vetTown, setVetTown] = useState(customer.emergencyVet?.town ?? '');
  const [vetCounty, setVetCounty] = useState(customer.emergencyVet?.county ?? '');
  const [vetPostcode, setVetPostcode] = useState(customer.emergencyVet?.postcode ?? '');
  const [vetTelephone, setVetTelephone] = useState(customer.emergencyVet?.telephone ?? '');
  const [vetEmail, setVetEmail] = useState(customer.emergencyVet?.email ?? '');

  const [keysProvided, setKeysProvided] = useState(customer.security?.keysProvided ?? false);
  const [alarmInstructions, setAlarmInstructions] = useState('');
  const [furtherInformation, setFurtherInformation] = useState(
    customer.security?.furtherInformation ?? '',
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sameAsClient && (!ecFirstName || !ecAddress1 || !ecTown || !ecPostcode)) {
      setError('Emergency contact name and address are required unless "same as client".');
      return;
    }
    if (!sameAsClient && !ecPhoneNumber) {
      setError('Emergency contact phone number is required unless "same as client".');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.updateCustomer(customer._id, {
        firstName,
        surname: surname || undefined,
        email,
        address1,
        address2: address2 || undefined,
        town,
        county: county || undefined,
        postcode,
        phoneNumber,
        emergencyContact: {
          sameAsClient,
          firstName: sameAsClient ? undefined : ecFirstName,
          surname: sameAsClient ? undefined : ecSurname || undefined,
          address1: sameAsClient ? undefined : ecAddress1,
          address2: sameAsClient ? undefined : ecAddress2 || undefined,
          town: sameAsClient ? undefined : ecTown,
          county: sameAsClient ? undefined : ecCounty || undefined,
          postcode: sameAsClient ? undefined : ecPostcode,
          phoneNumber: sameAsClient ? undefined : ecPhoneNumber,
          email: ecEmail || undefined,
        },
        emergencyVet: {
          practiceName: vetPractice,
          address1: vetAddress1,
          address2: vetAddress2 || undefined,
          town: vetTown,
          county: vetCounty || undefined,
          postcode: vetPostcode,
          telephone: vetTelephone,
          email: vetEmail || undefined,
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
        <div className="field-row">
          <div className="field">
            <label>First name</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Surname</label>
            <input type="text" value={surname} onChange={(e) => setSurname(e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Phone number</label>
            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label>First line of address</label>
          <input type="text" value={address1} onChange={(e) => setAddress1(e.target.value)} required />
        </div>
        <div className="field">
          <label>Second line of address</label>
          <input type="text" value={address2} onChange={(e) => setAddress2(e.target.value)} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Town</label>
            <input type="text" value={town} onChange={(e) => setTown(e.target.value)} required />
          </div>
          <div className="field">
            <label>County</label>
            <input type="text" value={county} onChange={(e) => setCounty(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Postcode</label>
          <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} required />
        </div>

        <div className="section-title">Emergency contact</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 400 }}>
          <input type="checkbox" checked={sameAsClient} onChange={(e) => setSameAsClient(e.target.checked)} />
          Same as client
        </label>
        {!sameAsClient && (
          <>
            <div className="field-row">
              <div className="field">
                <label>First name</label>
                <input type="text" value={ecFirstName} onChange={(e) => setEcFirstName(e.target.value)} />
              </div>
              <div className="field">
                <label>Surname</label>
                <input type="text" value={ecSurname} onChange={(e) => setEcSurname(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>First line of address</label>
              <input type="text" value={ecAddress1} onChange={(e) => setEcAddress1(e.target.value)} />
            </div>
            <div className="field">
              <label>Second line of address</label>
              <input type="text" value={ecAddress2} onChange={(e) => setEcAddress2(e.target.value)} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Town</label>
                <input type="text" value={ecTown} onChange={(e) => setEcTown(e.target.value)} />
              </div>
              <div className="field">
                <label>County</label>
                <input type="text" value={ecCounty} onChange={(e) => setEcCounty(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Postcode</label>
              <input type="text" value={ecPostcode} onChange={(e) => setEcPostcode(e.target.value)} />
            </div>
            <div className="field">
              <label>Phone number</label>
              <input type="tel" value={ecPhoneNumber} onChange={(e) => setEcPhoneNumber(e.target.value)} />
            </div>
          </>
        )}
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
            <label>Telephone</label>
            <input type="tel" value={vetTelephone} onChange={(e) => setVetTelephone(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label>First line of address</label>
          <input type="text" value={vetAddress1} onChange={(e) => setVetAddress1(e.target.value)} required />
        </div>
        <div className="field">
          <label>Second line of address</label>
          <input type="text" value={vetAddress2} onChange={(e) => setVetAddress2(e.target.value)} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Town</label>
            <input type="text" value={vetTown} onChange={(e) => setVetTown(e.target.value)} required />
          </div>
          <div className="field">
            <label>County</label>
            <input type="text" value={vetCounty} onChange={(e) => setVetCounty(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Postcode</label>
          <input type="text" value={vetPostcode} onChange={(e) => setVetPostcode(e.target.value)} required />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={vetEmail} onChange={(e) => setVetEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Alternative vet care authorisation</label>
          {customer.emergencyVet?.authorisation?.signedName ? (
            <div className="field-hint">
              Signed by {customer.emergencyVet.authorisation.signedName}
              {customer.emergencyVet.authorisation.signedAt
                ? ` on ${new Date(customer.emergencyVet.authorisation.signedAt).toLocaleDateString('en-GB')}`
                : ''}
            </div>
          ) : (
            <div className="field-hint">Not yet signed — set via the customer's intake form.</div>
          )}
        </div>

        <div className="section-title">Security</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 400 }}>
          <input type="checkbox" checked={keysProvided} onChange={(e) => setKeysProvided(e.target.checked)} />
          Keys provided
        </label>
        <div className="field">
          <label>Alarm/KeySafe Code</label>
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
