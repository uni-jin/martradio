"use client";

type Props = {
  open: boolean;
  variant: "notify" | "confirm";
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmBusy?: boolean;
  onDismiss: () => void;
  onConfirm?: () => void | Promise<void>;
};

export function SubscriptionFlowDialog({
  open,
  variant,
  title,
  message,
  confirmLabel = "확인",
  cancelLabel = "취소",
  confirmBusy = false,
  onDismiss,
  onConfirm,
}: Props) {
  if (!open) return null;

  const busy = Boolean(confirmBusy);

  const handlePrimary = () => {
    if (variant === "confirm" && onConfirm) {
      void onConfirm();
      return;
    }
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-flow-dlg-title"
      >
        <h2 id="subscription-flow-dlg-title" className="text-xl font-semibold text-stone-800">
          {title}
        </h2>
        <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-stone-700">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          {variant === "confirm" && (
            <button
              type="button"
              disabled={busy}
              onClick={onDismiss}
              className="rounded-lg border border-stone-300 px-4 py-2.5 text-base text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handlePrimary()}
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-base font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {busy ? "처리 중…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
