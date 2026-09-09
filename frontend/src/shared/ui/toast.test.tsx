import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast, type ToastOptions } from "./toast";

/**
 * Toasts are the receipt for every signed transaction, so the assertions here
 * are about the receipt surviving: the hash must reach the explorer link, and a
 * burst of confirmations must not push the newest notice out of view.
 */
function Emitter({ toasts }: { toasts: ToastOptions[] }) {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toasts.forEach(toast)}>
      emit
    </button>
  );
}

function renderWithToasts(toasts: ToastOptions[]) {
  return render(
    <ToastProvider>
      <Emitter toasts={toasts} />
    </ToastProvider>
  );
}

describe("useToast", () => {
  /**
   * Without the guard the hook returns null and the caller crashes on
   * `ctx.toast` — deep inside a submit handler, long after the render that
   * actually caused it. Failing at the boundary is what makes that debuggable.
   */
  it("refuses to run outside a provider", () => {
    function Orphan() {
      useToast();
      return null;
    }
    // React logs the thrown render error; silence it so the run stays readable.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Orphan />)).toThrow(/must be used within ToastProvider/);

    error.mockRestore();
  });
});

describe("ToastProvider", () => {
  it("shows the title and description of a notice", async () => {
    const user = userEvent.setup();
    renderWithToasts([
      { title: "Deposit confirmed", description: "1 250 tUSDC to Arkenia", intent: "success" },
    ]);

    await user.click(screen.getByRole("button", { name: "emit" }));

    expect(await screen.findByText("Deposit confirmed")).toBeInTheDocument();
    expect(screen.getByText("1 250 tUSDC to Arkenia")).toBeInTheDocument();
  });

  // The hash is the only way a user can verify what actually happened on chain.
  it("links a transaction hash to the explorer", async () => {
    const user = userEvent.setup();
    const txHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    renderWithToasts([{ title: "Deposit confirmed", txHash }]);

    await user.click(screen.getByRole("button", { name: "emit" }));

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", expect.stringContaining(txHash));
    expect(link).toHaveTextContent("0xabcdef…567890");
  });

  it("omits the explorer link when there is no hash", async () => {
    const user = userEvent.setup();
    renderWithToasts([{ title: "Order not placed", intent: "danger" }]);

    await user.click(screen.getByRole("button", { name: "emit" }));

    await screen.findByText("Order not placed");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("dismisses a notice from its close control", async () => {
    const user = userEvent.setup();
    renderWithToasts([{ title: "Deposit confirmed" }]);

    await user.click(screen.getByRole("button", { name: "emit" }));
    await screen.findByText("Deposit confirmed");

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("Deposit confirmed")).not.toBeInTheDocument();
  });

  /**
   * The queue is capped so a burst cannot fill the viewport. The cap has to
   * drop the oldest: dropping the newest would hide the confirmation the user
   * is actually waiting on.
   */
  it("caps the queue and keeps the newest notices", async () => {
    const user = userEvent.setup();
    renderWithToasts(
      Array.from({ length: 8 }, (_, i) => ({ title: `Notice ${i + 1}` }))
    );

    await user.click(screen.getByRole("button", { name: "emit" }));
    await screen.findByText("Notice 8");

    expect(screen.queryByText("Notice 1")).not.toBeInTheDocument();
    expect(screen.getByText("Notice 8")).toBeInTheDocument();
  });
});
