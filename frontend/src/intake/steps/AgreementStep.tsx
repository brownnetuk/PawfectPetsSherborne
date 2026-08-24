import { useEffect, useState } from 'react';
import * as api from '../../api/client';
import SignaturePad from '../SignaturePad';
import { TextField } from '../fields';
import type { AgreementData } from '../../types';

const DEFAULT_DECLARATION_TEXT =
  'I confirm that the information provided in this form is accurate and complete to the best of my knowledge, and I agree to be bound by the terms set out above.';

interface Props {
  value: AgreementData;
  onChange: (value: AgreementData) => void;
}

const TODAY = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default function AgreementStep({ value, onChange }: Props) {
  const set = <K extends keyof AgreementData>(key: K, v: AgreementData[K]) =>
    onChange({ ...value, [key]: v });

  // Staff can upload their own terms as a .docx (Settings > Business Info); falls
  // back to the text below if none has been uploaded yet, or the fetch fails.
  const [termsHtml, setTermsHtml] = useState<string | null>(null);
  useEffect(() => {
    api
      .fetchTerms()
      .then((r) => setTermsHtml(r.html || null))
      .catch(() => setTermsHtml(null));
  }, []);

  // Staff can edit this wording (Settings > Business Info); falls back to the
  // text below if none has been set yet, or the fetch fails.
  const [declarationText, setDeclarationText] = useState(DEFAULT_DECLARATION_TEXT);
  useEffect(() => {
    api
      .fetchDeclarationText()
      .then((r) => setDeclarationText(r.text || DEFAULT_DECLARATION_TEXT))
      .catch(() => setDeclarationText(DEFAULT_DECLARATION_TEXT));
  }, []);

  return (
    <div>
      <h2>Client agreement</h2>
      <p className="subtitle">Please read and sign to confirm you accept our terms.</p>

      <div className="terms-box terms-box--tall">
        {termsHtml ? (
          <div dangerouslySetInnerHTML={{ __html: termsHtml }} />
        ) : (
          <ol>
            <li>
              The client confirms all information provided in this form is accurate and will
              notify PawfectPets Sherborne promptly of any changes to contact, veterinary, or pet
              health details.
            </li>
            <li>
              The client authorises PawfectPets Sherborne to make decisions regarding the
              animal's welfare in an emergency, including obtaining veterinary treatment as set
              out in the Emergency Vet section of this form.
            </li>
            <li>
              The client is responsible for ensuring vaccinations, flea, and worming treatment
              are up to date for the duration of any care provided.
            </li>
            <li>
              PawfectPets Sherborne will take all reasonable care of the animal but cannot be
              held liable for illness, injury, loss, or death outside of its direct negligence.
            </li>
            <li>
              Where off-lead exercise has been consented to, the client accepts this is
              undertaken at their own risk as described in the Off-Lead Consent section.
            </li>
            <li>
              Any keys or security information (e.g. alarm codes) provided will be stored
              securely and used solely for the purpose of delivering the agreed service.
            </li>
            <li>
              Fees are payable as agreed at time of booking. PawfectPets Sherborne reserves the
              right to decline or discontinue a booking where an animal poses a safety risk not
              disclosed in this form.
            </li>
            <li>
              This agreement remains in effect for all future bookings unless the client
              notifies PawfectPets Sherborne of a change in circumstances.
            </li>
          </ol>
        )}

        <label className="terms-box-accept">
          <input
            type="checkbox"
            checked={!!value.termsAccepted}
            onChange={(e) => set('termsAccepted', e.target.checked)}
          />
          I have read the terms and conditions
        </label>
      </div>

      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '1.15rem' }}>Declaration</h2>
        <div className="terms-box">
          <p>{declarationText}</p>
        </div>
      </div>

      <TextField
        label="Typed signature (full name)"
        value={value.signedName}
        onChange={(v) => set('signedName', v)}
        required
      />
      <div className="field">
        <label>
          Sign with your mouse or finger <span className="required">*</span>
        </label>
        <SignaturePad value={value.signatureImage} onChange={(sig) => set('signatureImage', sig)} />
      </div>
      <div className="field">
        <label>Date</label>
        <input type="text" value={TODAY} disabled />
      </div>
    </div>
  );
}
