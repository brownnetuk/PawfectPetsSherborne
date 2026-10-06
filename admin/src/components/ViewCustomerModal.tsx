import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import Badge from './Badge';
import type { Customer } from '../types';

// A quick, read-only summary -- same "Client details" fields
// CustomerDetailPage.tsx's own ClientDetailsCard shows, just condensed into
// a modal so staff can check who a customer is without leaving the page
// they're on (e.g. a Boarding & Day Care booking's detail view).
interface Props {
  customer: Customer;
  onClose: () => void;
}

export default function ViewCustomerModal({ customer, onClose }: Props) {
  const navigate = useNavigate();
  return (
    <Modal title={customer.name} onClose={onClose}>
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Client details
          <Badge value={customer.status} />
        </div>
        <dl className="kv-grid">
          <dt>Name</dt>
          <dd>{customer.name}</dd>
          <dt>Address</dt>
          <dd>{customer.address || '—'}</dd>
          <dt>Phone number</dt>
          <dd>{customer.phoneNumber || '—'}</dd>
          <dt>Email</dt>
          <dd>{customer.email}</dd>
        </dl>
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
        <button className="btn btn-primary" onClick={() => navigate(`/customers/${customer._id}`)}>
          Go to Customer
        </button>
      </div>
    </Modal>
  );
}
