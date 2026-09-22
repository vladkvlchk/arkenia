"use client";

import { useId } from "react";
import { cn } from "@/shared/lib/cn";
import { normalizeAmountInput, toAmountString, TOKEN_DECIMALS } from "@/shared/lib/amount";
import { fmtAmount } from "@/shared/lib/format";
import { Field, inputClasses } from "./input";

interface NumberInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Token suffix inside the control, e.g. "tUSDC". */
  suffix?: string;
  /** When set, shows "Balance …" in the label row and enables the MAX action. */
  balance?: number;
  balanceLabel?: string;
  /** Token precision. Extra digits are truncated, never rounded — see toAmountString. */
  maxDecimals?: number;
  placeholder?: string;
  error?: string;
  hint?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** Decimal amount input: mono figures, token unit inside the field, honest MAX. */
export function NumberInput({
  label,
  value,
  onChange,
  suffix,
  balance,
  balanceLabel = "Balance",
  maxDecimals = TOKEN_DECIMALS,
  placeholder = "0.00",
  error,
  hint,
  disabled,
  id,
  className,
}: NumberInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  function handleChange(raw: string) {
    onChange(normalizeAmountInput(raw, maxDecimals));
  }

  return (
    <Field
      label={label}
      htmlFor={inputId}
      error={error}
      hint={hint}
      className={className}
      labelEnd={
        balance !== undefined && (
          <span className="font-mono">
            {balanceLabel} {fmtAmount(balance)}
          </span>
        )
      }
    >
      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onChange={(e) => handleChange(e.target.value)}
          className={cn(inputClasses, "h-11 pr-24 font-mono text-[15px]")}
        />
        <div className="absolute inset-y-0 right-3 flex items-center gap-2">
          {balance !== undefined && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(toAmountString(balance, maxDecimals))}
              className="rounded-sm font-mono text-2xs font-medium tracking-[0.08em] text-accent transition-colors duration-150 hover:text-accent-hover disabled:opacity-45"
            >
              MAX
            </button>
          )}
          {suffix && <span className="font-mono text-[13px] text-ink-subtle">{suffix}</span>}
        </div>
      </div>
    </Field>
  );
}
