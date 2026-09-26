import type { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  xl?: boolean;
  /** Near-fullscreen -- for data-dense views (e.g. a many-column table) that would otherwise need horizontal scrolling even at `xl`. */
  full?: boolean;
  headerActions?: ReactNode;
  /** Extra class(es) on the modal panel itself -- e.g. for a one-off background/theme. */
  className?: string;
}

export default function Modal({ title, onClose, children, wide, xl, full, headerActions, className }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}${xl ? ' modal-xl' : ''}${full ? ' modal-full' : ''}${className ? ` ${className}` : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {headerActions ? (
          <div className="modal-header-row">
            <h2>{title}</h2>
            {headerActions}
          </div>
        ) : (
          <h2>{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}
