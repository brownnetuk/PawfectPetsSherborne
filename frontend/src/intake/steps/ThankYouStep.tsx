interface Props {
  name: string;
}

export default function ThankYouStep({ name }: Props) {
  return (
    <div className="center-message">
      <h1>Thank you{name ? `, ${name}` : ''}!</h1>
      <p className="subtitle">
        Your registration is complete. We'll be in touch to confirm your pet's booking.
      </p>
    </div>
  );
}
