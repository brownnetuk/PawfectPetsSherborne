import { useEffect, useState, type FormEvent } from 'react';
import { fetchProfile, updateProfile } from '../api';
import type { EmergencyContact, EmergencyVet, Profile, ProfileUpdate } from '../types';

type Contact = Required<
  Pick<
    ProfileUpdate,
    'firstName' | 'surname' | 'phoneNumber' | 'address1' | 'address2' | 'town' | 'county' | 'postcode'
  >
>;

const CONTACT_FIELDS: { key: keyof Contact; label: string; type?: string; required?: boolean }[] = [
  { key: 'firstName', label: 'First name', required: true },
  { key: 'surname', label: 'Surname' },
  { key: 'phoneNumber', label: 'Mobile number', type: 'tel', required: true },
  { key: 'address1', label: 'Address line 1' },
  { key: 'address2', label: 'Address line 2' },
  { key: 'town', label: 'Town' },
  { key: 'county', label: 'County' },
  { key: 'postcode', label: 'Postcode' },
];

// `required` mirrors the backend DTOs (EmergencyContactDto,
// PortalEmergencyVetDto) so the browser catches gaps before the API does.
const EC_FIELDS: {
  key: Exclude<keyof EmergencyContact, 'sameAsClient'>;
  label: string;
  type?: string;
  required?: boolean;
}[] = [
  { key: 'firstName', label: 'First name', required: true },
  { key: 'surname', label: 'Surname' },
  { key: 'phoneNumber', label: 'Phone number', type: 'tel', required: true },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'address1', label: 'Address line 1', required: true },
  { key: 'address2', label: 'Address line 2' },
  { key: 'town', label: 'Town', required: true },
  { key: 'county', label: 'County' },
  { key: 'postcode', label: 'Postcode', required: true },
];

const VET_FIELDS: { key: keyof EmergencyVet; label: string; type?: string; required?: boolean }[] = [
  { key: 'practiceName', label: 'Practice name', required: true },
  { key: 'telephone', label: 'Telephone', type: 'tel', required: true },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'address1', label: 'Address line 1', required: true },
  { key: 'address2', label: 'Address line 2' },
  { key: 'town', label: 'Town', required: true },
  { key: 'county', label: 'County' },
  { key: 'postcode', label: 'Postcode', required: true },
];

function contactOf(p: Profile): Contact {
  return {
    firstName: p.firstName ?? '',
    surname: p.surname ?? '',
    phoneNumber: p.phoneNumber ?? '',
    address1: p.address1 ?? '',
    address2: p.address2 ?? '',
    town: p.town ?? '',
    county: p.county ?? '',
    postcode: p.postcode ?? '',
  };
}

// Text inputs send '' for cleared fields; drop those so an empty optional
// email doesn't trip the backend's @IsEmail validation.
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '')) as T;
}

function Fields<K extends string>({
  fields,
  values,
  onChange,
}: {
  fields: { key: K; label: string; type?: string; required?: boolean }[];
  values: Partial<Record<K, unknown>>;
  onChange: (key: K, value: string) => void;
}) {
  return (
    <div className="grid">
      {fields.map((f) => (
        <div className="field" key={f.key}>
          <label htmlFor={f.key}>
            {f.label}
            {f.required && <span className="required"> *</span>}
          </label>
          <input
            id={f.key}
            type={f.type ?? 'text'}
            required={f.required}
            value={String(values[f.key] ?? '')}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

export default function DetailsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [ec, setEc] = useState<EmergencyContact>({ sameAsClient: false });
  const [vet, setVet] = useState<EmergencyVet>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // The vet section is optional as a whole, but complete once started.
  const hasVet = Object.values(vet).some((v) => v);

  function load(p: Profile) {
    setProfile(p);
    setContact(contactOf(p));
    setEc(p.emergencyContact ?? { sameAsClient: false });
    setVet(p.emergencyVet ?? {});
  }

  useEffect(() => {
    fetchProfile().then(load).catch((err: Error) => setError(err.message));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!contact) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const dto: ProfileUpdate = {
        ...contact,
        emergencyContact: ec.sameAsClient ? { sameAsClient: true } : compact(ec),
      };
      if (hasVet) dto.emergencyVet = compact(vet);
      load(await updateProfile(dto));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your details.');
    } finally {
      setSaving(false);
    }
  }

  if (!profile || !contact) {
    return error ? <div className="error-banner">{error}</div> : <p className="empty-state">Loading…</p>;
  }

  return (
    <form onSubmit={save}>
      <p className="subtitle">
        Keep these up to date so we can reach you. Your email address is how you sign in, so to change
        it please get in touch with us.
      </p>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={profile.email} disabled />
      </div>
      <Fields
        fields={CONTACT_FIELDS}
        values={contact}
        onChange={(k, v) => {
          setSaved(false);
          setContact({ ...contact, [k]: v });
        }}
      />
      <p className="muted small">
        You'll need the last 3 digits of your mobile number to sign in.
      </p>

      <h3 className="section-title">Emergency contact</h3>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={ec.sameAsClient}
          onChange={(e) => {
            setSaved(false);
            setEc({ ...ec, sameAsClient: e.target.checked });
          }}
        />
        <span>Same as me</span>
      </label>
      {!ec.sameAsClient && (
        <Fields
          fields={EC_FIELDS}
          values={ec}
          onChange={(k, v) => {
            setSaved(false);
            setEc({ ...ec, [k]: v });
          }}
        />
      )}

      <h3 className="section-title">Vet</h3>
      <Fields
        fields={hasVet ? VET_FIELDS : VET_FIELDS.map((f) => ({ ...f, required: false }))}
        values={vet}
        onChange={(k, v) => {
          setSaved(false);
          setVet({ ...vet, [k]: v });
        }}
      />

      {error && <div className="error-banner">{error}</div>}
      {saved && <div className="success-banner">Your details have been saved.</div>}
      <div className="actions end">
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
