import { TextField } from '../fields';
import type { EmergencyVetData } from '../../types';

interface Props {
  value: EmergencyVetData;
  onChange: (value: EmergencyVetData) => void;
}

export default function EmergencyVetStep({ value, onChange }: Props) {
  const set = <K extends keyof EmergencyVetData>(key: K, v: EmergencyVetData[K]) =>
    onChange({ ...value, [key]: v });

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
        label="Address"
        value={value.address}
        onChange={(v) => set('address', v)}
        required
        multiline
      />
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
      <div className="checkbox-row">
        <input
          type="checkbox"
          id="vet-ack"
          checked={value.alternativeVetAuthorised}
          onChange={(e) => set('alternativeVetAuthorised', e.target.checked)}
        />
        <label htmlFor="vet-ack">
          I authorise PawfectPets Sherborne to arrange alternative veterinary care for my pet if
          my usual vet is unobtainable in an emergency. <span className="required">*</span>
        </label>
      </div>
    </div>
  );
}
