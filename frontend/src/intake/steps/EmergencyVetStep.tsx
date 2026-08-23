import { useEffect, useState } from 'react';
import * as api from '../../api/client';
import SignaturePad from '../SignaturePad';
import { TextField } from '../fields';
import type { EmergencyVetData } from '../../types';

const DEFAULT_AUTHORISATION_TEXT =
  'I authorise PawfectPets Sherborne to arrange alternative veterinary care for my pet if my usual vet is unobtainable in an emergency.';

interface Props {
  value: EmergencyVetData;
  onChange: (value: EmergencyVetData) => void;
}

const TODAY = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default function EmergencyVetStep({ value, onChange }: Props) {
  const set = <K extends keyof EmergencyVetData>(key: K, v: EmergencyVetData[K]) =>
    onChange({ ...value, [key]: v });

  const setAuth = (v: Partial<NonNullable<EmergencyVetData['authorisation']>>) =>
    onChange({
      ...value,
      authorisation: { signedName: '', ...value.authorisation, ...v },
    });

  // Staff can edit this wording (Settings > Business Info); falls back to the
  // text below if none has been set yet, or the fetch fails.
  const [authorisationText, setAuthorisationText] = useState(DEFAULT_AUTHORISATION_TEXT);
  useEffect(() => {
    api
      .fetchVetAuthorisationText()
      .then((r) => setAuthorisationText(r.text || DEFAULT_AUTHORISATION_TEXT))
      .catch(() => setAuthorisationText(DEFAULT_AUTHORISATION_TEXT));
  }, []);

  return (
    <div>
      <h2>Emergency vet</h2>
      <p className="subtitle">Your usual vet practice, in case of illness or injury.</p>
      <TextField
        label="Vet practice"
        value={value.practiceName}
        onChange={(v) => set('practiceName', v)}
        required
      />
      <TextField
        label="First line of address"
        value={value.address1}
        onChange={(v) => set('address1', v)}
        required
      />
      <TextField
        label="Second line of address"
        value={value.address2 ?? ''}
        onChange={(v) => set('address2', v)}
      />
      <div className="grid-2">
        <TextField label="Town" value={value.town} onChange={(v) => set('town', v)} required />
        <TextField label="County" value={value.county ?? ''} onChange={(v) => set('county', v)} />
      </div>
      <TextField label="Postcode" value={value.postcode} onChange={(v) => set('postcode', v)} required />
      <div className="grid-2">
        <TextField
          label="Telephone"
          type="tel"
          value={value.telephone}
          onChange={(v) => set('telephone', v)}
          required
        />
        <TextField
          label="Email"
          type="email"
          value={value.email ?? ''}
          onChange={(v) => set('email', v)}
        />
      </div>

      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '1.15rem' }}>Alternative vet care authorisation</h2>
        <div className="terms-box">
          <p>{authorisationText}</p>
        </div>
        <TextField
          label="Typed signature (full name)"
          value={value.authorisation?.signedName ?? ''}
          onChange={(v) => setAuth({ signedName: v })}
          required
        />
        <div className="field">
          <label>
            Sign with your mouse or finger <span className="required">*</span>
          </label>
          <SignaturePad
            value={value.authorisation?.signatureImage}
            onChange={(sig) => setAuth({ signatureImage: sig })}
          />
        </div>
        <div className="field">
          <label>Date</label>
          <input type="text" value={TODAY} disabled />
        </div>
      </div>
    </div>
  );
}
