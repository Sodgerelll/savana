import type { ReactNode } from "react";
import { X } from "lucide-react";

export function AdminModal({
  title,
  description,
  onClose,
  children,
  wide = false,
  disableClose = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  disableClose?: boolean;
}) {
  const handleClose = () => {
    if (disableClose) {
      return;
    }
    onClose();
  };

  return (
    <div className="admin-modal-backdrop">
      <div
        className={`admin-modal ${wide ? "admin-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="admin-modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={handleClose}
            aria-label="Close modal"
            disabled={disableClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  );
}
