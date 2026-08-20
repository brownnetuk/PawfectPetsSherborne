import IntakeForm from './intake/IntakeForm';

function getCustomerIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/intake\/([a-fA-F0-9]{24})\/?$/);
  return match ? match[1] : null;
}

export default function App() {
  const customerId = getCustomerIdFromUrl();

  return (
    <div className="page">
      <div className="brand-header">PawfectPets Sherborne</div>
      <IntakeForm customerId={customerId} />
    </div>
  );
}
