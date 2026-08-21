import type { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  xl?: boolean;
}

export default function Modal({ title, onClose, children, wide, xl }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}${xl ? ' modal-xl' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
