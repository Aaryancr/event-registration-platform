import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 9999,
        maxWidth: '420px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        const borderColor = isSuccess
          ? 'var(--status-success-border)'
          : isError
          ? 'var(--status-danger-border)'
          : 'var(--status-info-border)';

        const iconColor = isSuccess
          ? 'var(--status-success)'
          : isError
          ? 'var(--status-danger)'
          : 'var(--status-info)';

        return (
          <div
            key={toast.id}
            style={{
              background: 'rgba(14, 21, 38, 0.94)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1.5px solid ${borderColor}`,
              color: '#f8fafc',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg), 0 0 16px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              pointerEvents: 'auto',
              animation: 'scaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{ color: iconColor, flexShrink: 0, display: 'flex' }}>
              {isSuccess && <CheckCircle2 size={19} />}
              {isError && <AlertCircle size={19} />}
              {!isSuccess && !isError && <Info size={19} />}
            </div>

            <span style={{ fontSize: '0.88rem', fontWeight: 500, flex: 1, lineHeight: 1.45 }}>
              {toast.message}
            </span>

            <button
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
