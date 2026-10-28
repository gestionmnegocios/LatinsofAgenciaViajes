"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Building2, Plus } from "lucide-react";

import { normalize, searchProviders } from "@/lib/data/providers";
import type { Provider } from "@/lib/finance/types";

interface ProviderComboboxProps {
  providers: readonly Provider[];
  value: string;
  disabled?: boolean;
  onSelect: (provider: Provider) => void;
  /** Crea un proveedor personalizado de la agencia y lo devuelve. */
  onCreate: (name: string) => Provider;
}

const CATEGORY_LABELS: Record<Provider["category"], string> = {
  MAYORISTA: "Mayorista",
  CONSOLIDADOR: "Consolidador",
  HOTEL: "Hotel",
  ASISTENCIA: "Asistencia",
  OPERADOR_LOCAL: "Operador local",
};

/**
 * Selector predictivo de proveedores (ARIA combobox). La lista se posiciona
 * con `fixed` para no quedar recortada por el scroll horizontal de la tabla.
 */
export function ProviderCombobox({ providers, value, disabled, onSelect, onCreate }: ProviderComboboxProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const text = query ?? value;
  const results = useMemo(() => searchProviders(providers, query ?? "").slice(0, 8), [providers, query]);
  const trimmed = text.trim();
  const canCreate =
    query !== null && trimmed.length > 1 && !providers.some((p) => normalize(p.name) === normalize(trimmed));
  const itemCount = results.length + (canCreate ? 1 : 0);
  // El índice resaltado se acota cuando la lista se encoge al filtrar.
  const active = Math.min(highlight, Math.max(itemCount - 1, 0));

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => setRect(inputRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setQuery(null);
  }

  function choose(index: number) {
    if (index < results.length) {
      onSelect(results[index]);
    } else if (canCreate) {
      onSelect(onCreate(trimmed));
    }
    close();
  }

  return (
    <div className="relative">
      <Building2 className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && itemCount > 0 ? `${listId}-${active}` : undefined}
        aria-label="Proveedor"
        placeholder="Proveedor…"
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight(itemCount ? (active + 1) % itemCount : 0);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight(itemCount ? (active - 1 + itemCount) % itemCount : 0);
          } else if (e.key === "Enter" && open && itemCount > 0) {
            e.preventDefault();
            choose(active);
          } else if (e.key === "Escape") {
            close();
          }
        }}
        className="w-full rounded-md border border-transparent bg-transparent py-1.5 pl-7 pr-2 text-sm font-medium text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-200 focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:hover:border-transparent"
      />
      {open && rect && itemCount > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="fixed z-50 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
          style={{ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 260) }}
          // Evita que el blur del input cierre la lista antes del click.
          onMouseDown={(e) => e.preventDefault()}
        >
          {results.map((provider, index) => (
            <li
              key={provider.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={active === index}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(index)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 ${
                active === index ? "bg-slate-100" : ""
              }`}
            >
              <span className="truncate text-slate-900">{provider.name}</span>
              <span className="shrink-0 text-xs text-slate-500">
                {CATEGORY_LABELS[provider.category]} · {provider.defaultCurrency}
                {provider.isSystemPreload ? "" : " · Propio"}
              </span>
            </li>
          ))}
          {canCreate && (
            <li
              id={`${listId}-${results.length}`}
              role="option"
              aria-selected={active === results.length}
              onMouseEnter={() => setHighlight(results.length)}
              onClick={() => choose(results.length)}
              className={`flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-slate-700 ${
                active === results.length ? "bg-slate-100" : ""
              }`}
            >
              <Plus className="size-3.5" aria-hidden /> Crear proveedor «{trimmed}»
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
