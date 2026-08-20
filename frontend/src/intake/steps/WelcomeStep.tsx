interface Props {
  name: string;
  isLead: boolean;
}

export default function WelcomeStep({ name, isLead }: Props) {
  return (
    <div>
      <h1>Welcome{name ? `, ${name}` : ''}</h1>
      <p className="subtitle">
        Complete this form so we can look after your pet. Takes about 5 minutes.
      </p>
      {!isLead && (
        <p className="field-hint">
          We couldn't find an existing record for this link, so you're starting a fresh
          registration — just fill in your details as you go.
        </p>
      )}
    </div>
  );
}
