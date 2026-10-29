"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";

import {
  addBankImage,
  deleteBankImage,
  IMAGE_BANK_LIMIT,
  IMAGE_TYPES,
  imageProblem,
  listBankImages,
  replaceBankImage,
  updateBankImageCaption,
  type BankImage,
} from "@/lib/data/landing-repository";

/**
 * Banco de imágenes de la agencia (máximo 10) para armar las micro-landings
 * de cotización. Se pueden sustituir o eliminar para liberar cupo.
 */
export function ImageBankSection({ agencyId, editable }: { agencyId: string; editable: boolean }) {
  const [images, setImages] = useState<BankImage[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // "add" o id de la imagen
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<BankImage | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBankImages()
      .then((data) => !cancelled && setImages(data))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "No se pudo cargar el banco."));
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción.");
    } finally {
      setBusy(null);
    }
  }

  async function handleAdd(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (addRef.current) addRef.current.value = "";
    const room = IMAGE_BANK_LIMIT - (images?.length ?? 0);
    if (list.length > room) {
      setError(`Solo caben ${room} imagen${room === 1 ? "" : "es"} más; elimina o sustituye alguna.`);
      return;
    }
    const problem = list.map(imageProblem).find(Boolean);
    if (problem) {
      setError(problem);
      return;
    }
    await run("add", async () => {
      for (const file of list) {
        const saved = await addBankImage(agencyId, file, "");
        setImages((current) => [...(current ?? []), saved]);
      }
    });
  }

  async function handleReplace(file: File | undefined) {
    const target = replacing;
    if (replaceRef.current) replaceRef.current.value = "";
    setReplacing(null);
    if (!file || !target) return;
    await run(target.id, async () => {
      const updated = await replaceBankImage(agencyId, target, file);
      setImages((current) => (current ?? []).map((i) => (i.id === updated.id ? updated : i)));
    });
  }

  const count = images?.length ?? 0;
  const full = count >= IMAGE_BANK_LIMIT;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Banco de imágenes <span className="font-normal text-slate-400">({count}/{IMAGE_BANK_LIMIT})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Fotos de destinos y hoteles para el enlace de cotización que recibe el cliente. JPG, PNG o WEBP de hasta 5 MB.
          </p>
        </div>
        {editable && (
          <>
            <input
              ref={addRef}
              id="bank-add"
              type="file"
              multiple
              accept={IMAGE_TYPES.join(",")}
              className="sr-only"
              disabled={full || busy !== null}
              onChange={(e) => void handleAdd(e.target.files)}
            />
            <label
              htmlFor="bank-add"
              className={`inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 ${
                full || busy !== null ? "pointer-events-none opacity-50" : "cursor-pointer"
              }`}
            >
              {busy === "add" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
              Subir imágenes
            </label>
          </>
        )}
      </div>

      <input
        ref={replaceRef}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void handleReplace(e.target.files?.[0])}
      />

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {full && editable && <p className="mb-3 text-xs text-amber-700">El banco está lleno: sustituye o elimina una imagen para subir otra.</p>}

      {images === null && !error && <div className="h-32 animate-pulse rounded-lg bg-slate-100" aria-busy="true" />}
      {images && images.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Aún no hay imágenes.</p>
      )}

      {images && images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {images.map((img) => (
            <li key={img.id} className="overflow-hidden rounded-lg border border-slate-200">
              <div className="relative aspect-[4/3] bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.caption || "Imagen del banco"} className="size-full object-cover" />
                {busy === img.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                    <Loader2 className="size-5 animate-spin text-slate-600" aria-label="Procesando" />
                  </div>
                )}
              </div>
              <div className="space-y-1.5 p-2">
                <input
                  aria-label="Texto de la imagen"
                  defaultValue={img.caption}
                  disabled={!editable}
                  placeholder="Ej. Playa Spratt Bight"
                  onBlur={(e) => {
                    const caption = e.target.value;
                    if (caption !== img.caption) {
                      void run(img.id, async () => {
                        await updateBankImageCaption(img.id, caption);
                        setImages((current) => (current ?? []).map((i) => (i.id === img.id ? { ...i, caption: caption.trim() } : i)));
                      });
                    }
                  }}
                  className="w-full rounded border border-transparent px-1 py-0.5 text-xs text-slate-700 outline-none hover:border-slate-200 focus:border-slate-400 disabled:bg-transparent"
                />
                {editable && (
                  <div className="flex justify-between">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        setReplacing(img);
                        replaceRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      <RefreshCw className="size-3" aria-hidden /> Sustituir
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(img.id, async () => {
                          await deleteBankImage(img);
                          setImages((current) => (current ?? []).filter((i) => i.id !== img.id));
                        })
                      }
                      aria-label="Eliminar imagen"
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
