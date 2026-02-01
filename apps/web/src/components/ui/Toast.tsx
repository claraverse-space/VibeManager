import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { useUIStore, type Toast as ToastType } from '../../stores/uiStore';

const icons = {
  info: Info,
  error: AlertCircle,
  success: CheckCircle,
  warning: AlertTriangle,
};

const bgStyles = {
  info: 'bg-accent/15 border-accent/30',
  error: 'bg-danger/15 border-danger/30',
  success: 'bg-success/15 border-success/30',
  warning: 'bg-warn/15 border-warn/30',
};

const textStyles = {
  info: 'text-accent',
  error: 'text-danger',
  success: 'text-success',
  warning: 'text-warn',
};

function ToastItem({ toast }: { toast: ToastType }) {
  const { dismissToast } = useUIStore();
  const Icon = icons[toast.type];

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 border text-[12px] shadow-lg ${bgStyles[toast.type]}`}
      style={{ animation: 'toast-in 0.2s ease-out' }}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${textStyles[toast.type]}`} />
      <span className="flex-1 text-text-primary">{toast.message}</span>
      <button
        onClick={() => dismissToast(toast.id)}
        className={`p-0.5 hover:opacity-70 transition-opacity ${textStyles[toast.type]}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-[320px]">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
