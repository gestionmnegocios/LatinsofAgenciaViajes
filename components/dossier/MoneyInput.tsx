"use client";

import { useState, type InputHTMLAttributes, type Ref } from "react";

import { formatNumber, parseAmount } from "@/lib/finance/format";

interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number;
  /** Se dispara en cada tecla para que el Termómetro reaccione al instante. */
  onValueChange: (value: number) => void;
  prefix?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Input de montos en formato colombiano. Mientras tiene foco muestra lo que
 * el usuario escribe; al salir lo reformatea con separadores de miles.
 */
export function MoneyInput({
  value,
  onValueChange,
  prefix = "$",
  className = "",
  onFocus,
  onBlur,
  ref,
  ...rest
}: MoneyInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (value ? formatNumber(value) : "");

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-slate-400">
        {prefix}
      </span>
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        onFocus={(e) => {
          setDraft(value ? formatNumber(value) : "");
          e.currentTarget.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          onValueChange(parseAmount(e.target.value));
        }}
        onBlur={(e) => {
          setDraft(null);
          onBlur?.(e);
        }}
        className={`w-full rounded-md border border-transparent bg-transparent py-1.5 pr-2 text-right ${prefix.length > 1 ? "pl-10" : "pl-6"} text-sm tabular-nums text-slate-900 outline-none transition hover:border-slate-200 focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:border-transparent`}
      />
    </div>
  );
}
