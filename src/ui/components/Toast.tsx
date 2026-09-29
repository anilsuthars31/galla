import { useEffect } from 'react';

export interface ToastMessage {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

export function Toast({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, toast.action ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.run();
            onClose();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
