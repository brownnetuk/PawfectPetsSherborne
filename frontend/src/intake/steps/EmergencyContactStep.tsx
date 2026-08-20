import { TextField, ToggleField } from '../fields';
import type { EmergencyContactData } from '../../types';

interface Props {
  value: EmergencyContactData;
  onChange: (value: EmergencyContactData) => void;
}

export default function EmergencyContactStep({ value, onChange }: Props) {
  const set = <K extends keyof EmergencyContactData>(key: K, v: EmergencyContactData[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div>
      <h2>Emergency contact</h2>
      <p className="subtitle">
        Someone we can reach if we can't get hold of you while your pet is in our care.
      </p>
      <ToggleField
        label="Same as client"
        value={value.sameAsClient}
        onChange={(v) => set('sameAsClient', v)}
      />
      {!value.sameAsClient && (
        <>
          <TextField
            label="Name & surname"
            value={value.name ?? ''}
            onChange={(v) => set('name', v)}
            required
          />
          <TextField
            label="Address"
            value={value.address ?? ''}
            onChange={(v) => set('address', v)}
            required
            multiline
          />
        </>
      )}
      <div className="grid-2">
        <TextField
          label="Telephone"
          type="tel"
          value={value.telephone ?? ''}
          onChange={(v) => set('telephone', v)}
        />
        <TextField
          label="Mobile"
          type="tel"
          value={value.mobile ?? ''}
          onChange={(v) => set('mobile', v)}
        />
      </div>
      <div className="field-hint" style={{ marginTop: -10, marginBottom: 18 }}>
        At least one of telephone or mobile is required.
      </div>
      <TextField
        label="Email"
        type="email"
        value={value.email ?? ''}
        onChange={(v) => set('email', v)}
      />
    </div>
  );
}
