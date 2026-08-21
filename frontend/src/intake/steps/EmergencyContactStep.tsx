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
          <div className="grid-2">
            <TextField
              label="First name"
              value={value.firstName ?? ''}
              onChange={(v) => set('firstName', v)}
              required
            />
            <TextField label="Surname" value={value.surname ?? ''} onChange={(v) => set('surname', v)} />
          </div>
          <TextField
            label="First line of address"
            value={value.address1 ?? ''}
            onChange={(v) => set('address1', v)}
            required
          />
          <TextField
            label="Second line of address"
            value={value.address2 ?? ''}
            onChange={(v) => set('address2', v)}
          />
          <div className="grid-2">
            <TextField label="Town" value={value.town ?? ''} onChange={(v) => set('town', v)} required />
            <TextField label="County" value={value.county ?? ''} onChange={(v) => set('county', v)} />
          </div>
          <TextField
            label="Postcode"
            value={value.postcode ?? ''}
            onChange={(v) => set('postcode', v)}
            required
          />
          <TextField
            label="Phone number"
            type="tel"
            value={value.phoneNumber ?? ''}
            onChange={(v) => set('phoneNumber', v)}
            required
          />
        </>
      )}
      <TextField
        label="Email"
        type="email"
        value={value.email ?? ''}
        onChange={(v) => set('email', v)}
      />
    </div>
  );
}
