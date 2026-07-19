import { useCallback, useState } from "react";
import { toast } from "sonner";
import { AdminButton, Modal } from "./_shared";

/**
 * Collects the reason a platform action requires.
 *
 * Every write in the admin API demands one, and rightly: these actions reach
 * into a customer's account and the audit row is the only place the
 * justification is recorded. A prompt makes that requirement visible at the
 * point of the decision rather than surfacing as a validation error afterwards.
 *
 * Built from the existing admin Modal and AdminButton so it matches the rest
 * of the dashboard.
 */

interface Pending {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  run: (reason: string) => Promise<unknown>;
  onDone?: () => void;
}

export function useReasonPrompt() {
  const [pending, setPending] = useState<Pending>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = useCallback((input: Pending) => {
    setReason("");
    setPending(input);
  }, []);

  async function confirm() {
    if (!pending) return;
    // Matches the server's own minimum, so a too-short reason is caught here
    // rather than after the request round-trips.
    if (reason.trim().length < 4) {
      toast.error("Enter a reason of at least four characters");
      return;
    }
    setBusy(true);
    try {
      await pending.run(reason.trim());
      toast.success(`${pending.confirmLabel} completed`);
      pending.onDone?.();
      setPending(undefined);
    } catch (error) {
      toast.error(`${pending.confirmLabel} failed`, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const element = (
    <Modal
      open={Boolean(pending)}
      onClose={() => !busy && setPending(undefined)}
      title={pending?.title ?? ""}
      description={pending?.description}
      footer={
        <>
          <AdminButton onClick={() => setPending(undefined)} disabled={busy}>Cancel</AdminButton>
          <AdminButton
            variant={pending?.destructive ? "danger" : "primary"}
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy ? "Working…" : pending?.confirmLabel}
          </AdminButton>
        </>
      }
    >
      <div className="adm-field">
        <label>Reason</label>
        <textarea
          className="adm-textarea"
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Recorded in the platform audit trail"
        />
      </div>
      <p className="adm-notice mt-3">
        This is stored against your account in the platform audit log along with the action, the
        target, and your address.
      </p>
    </Modal>
  );

  return { ask, element };
}
