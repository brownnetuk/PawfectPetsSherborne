import { TextField } from '../fields';
import type { ClientDetails } from '../../types';

interface Props {
  value: ClientDetails;
  onChange: (value: ClientDetails) => void;
}

export default function ClientDetailsStep({ value, onChange }: Props) {
  const set = <K extends keyof ClientDetails>(key: K, v: ClientDetails[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div>
      <h2>Your details</h2>
      <p className="subtitle">Let's confirm who we're looking after your pet for.</p>
      <TextField label="Name & surname" value={value.name} onChange={(v) => set('name', v)} required />
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
          value={value.telephone ?? ''}
          onChange={(v) => set('telephone', v)}
        />
        <TextField
          label="Mobile"
          type="tel"
          value={value.mobile}
          onChange={(v) => set('mobile', v)}
          required
        />
      </div>
      <TextField label="Email" type="email" value={value.email} onChange={(v) => set('email', v)} required />
    </div>
  );
}
