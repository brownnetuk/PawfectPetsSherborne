import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from './icons';

export interface ActionsMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
}

interface Props {
  items: ActionsMenuItem[];
  label?: string;
}

export default function ActionsMenu({ items, label = 'Actions' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function choose(item: ActionsMenuItem) {
    if (item.disabled) return;
    setOpen(false);
    item.onClick();
  }

  return (
    <div className="actions-menu" ref={ref}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
        {label} <ChevronDownIcon />
      </button>
      {open && (
        <div className="actions-menu-list">
          {items.map((item) => (
            <div key={item.label}>
              {item.dividerBefore && <div className="actions-menu-divider" />}
              <button
                type="button"
                className={item.danger ? 'actions-menu-danger' : undefined}
                onClick={() => choose(item)}
                disabled={item.disabled}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
