import type { ReactNode } from 'react';

interface Props {
  title?: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
}

export default function Modal({ title, children, onClose, closeLabel = 'OK' }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {title && <h2>{title}</h2>}
        {children}
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
