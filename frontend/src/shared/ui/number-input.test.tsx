/**
 * NumberInput is the single entry point for every amount in the app: campaign
 * deposits, and premarket order price and size. These tests cover the wiring
 * between the field and its normalisation, the MAX action, and the accessible
 * error association. Exhaustive normalisation cases live in
 * shared/lib/amount.test.ts, where they cost nothing to run.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { NumberInput } from "./number-input";

/**
 * The component is controlled and holds no state of its own, so typing into it
 * with a fixed `value` prop would render nothing. This harness supplies the
 * state the app supplies in production.
 */
function ControlledAmount({ initial = "", maxDecimals }: { initial?: string; maxDecimals?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <NumberInput label="Amount" value={value} onChange={setValue} maxDecimals={maxDecimals} />
  );
}

describe("NumberInput input handling", () => {
  it("accepts a decimal amount as typed", async () => {
    const user = userEvent.setup();
    render(<ControlledAmount />);
    const input = screen.getByLabelText("Amount");

    await user.type(input, "1250.75");

    expect(input).toHaveValue("1250.75");
  });

  it("rejects characters that are not part of an amount", async () => {
    const user = userEvent.setup();
    render(<ControlledAmount />);
    const input = screen.getByLabelText("Amount");

    await user.type(input, "12abc.5$");

    expect(input).toHaveValue("12.5");
  });

  it("lets typing continue after a stray separator", async () => {
    const user = userEvent.setup();
    render(<ControlledAmount />);
    const input = screen.getByLabelText("Amount");

    await user.type(input, "1.2.");
    expect(input).toHaveValue("1.2");

    await user.type(input, "3");
    expect(input).toHaveValue("1.23");
  });

  // Pasting is the realistic path to a malformed amount; typing rarely produces
  // grouped input. The assertion that matters is the magnitude, not the exact
  // string: a paste must never silently multiply what the user meant to send.
  it("does not change the magnitude of a pasted grouped amount", async () => {
    const user = userEvent.setup();
    render(<ControlledAmount />);
    const input = screen.getByLabelText("Amount");

    await user.click(input);
    await user.paste("1.234.567");

    expect(input).toHaveValue("1.234");
  });

  it("truncates the fraction to the token precision", async () => {
    const user = userEvent.setup();
    render(<ControlledAmount />);
    const input = screen.getByLabelText("Amount");

    await user.type(input, "1.99999999");

    expect(input).toHaveValue("1.999999");
  });
});

describe("NumberInput MAX action", () => {
  it("fills the field with the full balance", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberInput label="Amount" value="" onChange={onChange} balance={1250.5} />);

    await user.click(screen.getByRole("button", { name: "MAX" }));

    expect(onChange).toHaveBeenCalledWith("1250.5");
  });

  /**
   * A balance derived from a division carries more digits than the token has.
   * Emitting it verbatim let parseUnits round *up* — 1.9999999 became 2.0 —
   * producing a transfer larger than the balance it came from, which reverts
   * on chain after the user has already paid gas.
   */
  it("never emits more precision than the token carries", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberInput label="Amount" value="" onChange={onChange} balance={1.9999999} />);

    await user.click(screen.getByRole("button", { name: "MAX" }));

    expect(onChange).toHaveBeenCalledWith("1.999999");
  });

  it("never emits exponential notation for a large balance", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberInput label="Amount" value="" onChange={onChange} balance={1e21} />);

    await user.click(screen.getByRole("button", { name: "MAX" }));

    expect(onChange).toHaveBeenCalledWith("1000000000000000000000");
  });

  it("is absent when no balance is supplied", () => {
    render(<NumberInput label="Amount" value="" onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "MAX" })).not.toBeInTheDocument();
  });

  it("does nothing while the field is disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberInput label="Amount" value="" onChange={onChange} balance={100} disabled />);

    await user.click(screen.getByRole("button", { name: "MAX" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("NumberInput accessibility", () => {
  // The error is the only signal that a deposit will fail. If it is not
  // associated with the field, a screen reader announces an unremarkable text
  // box and the user confirms the transaction without ever hearing why it is
  // invalid.
  it("associates the error message with the field", () => {
    render(
      <NumberInput label="Amount" value="500" onChange={vi.fn()} error="Exceeds your balance" />
    );
    const input = screen.getByLabelText("Amount");
    const alert = screen.getByRole("alert");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(alert).toHaveTextContent("Exceeds your balance");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
  });

  it("shows the balance in the label row", () => {
    render(<NumberInput label="Amount" value="" onChange={vi.fn()} balance={1234.5} />);

    // fmtAmount emits non-breaking spaces, so match on normalised whitespace.
    expect(
      screen.getByText((text) => text.replace(/\s/g, " ") === "Balance 1 234.50")
    ).toBeInTheDocument();
  });
});
