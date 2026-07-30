import { useEffect, useRef } from "react";

// In-app replacement for window.confirm().
//
// The native dialog freezes the renderer while it is open, which makes the
// destructive paths in the admin area impossible to exercise from a browser
// automation harness — the delete-assessment cascade had to be clicked by a
// human every time it was verified. This is ordinary DOM, so it can be driven
// like anything else on the page.
//
// Cancel holds the initial focus deliberately: these dialogs guard irreversible
// actions, so a stray Return should dismiss rather than confirm.

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="absolute inset-0 bg-gray-900/40"
        onClick={() => { if (!busy) onCancel(); }}
      />
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl max-w-md w-full p-6">
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-gray-900 mb-2">
          {title}
        </h2>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50 transition-colors ${
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-[#3366FF] hover:bg-[#2952CC]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
