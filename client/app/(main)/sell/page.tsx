"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ImagePlus,
  X,
  GripVertical,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Dropdown } from "@/components/ui/Dropdown";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CONDITIONS,
  CONDITION_LABELS,
} from "@/types/constants";

const MAX_PHOTOS = 8;

interface UploadedPhoto {
  id: string;
  previewUrl: string;
  storagePath: string;
  publicUrl: string;
  uploading: boolean;
}

interface FormData {
  title: string;
  description: string;
  category: string;
  condition: string;
  price: string;
  is_negotiable: boolean;
}

interface ListingResponse {
  id: string;
  title: string;
}

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({
  value: c,
  label: CATEGORY_LABELS[c] || c,
}));

const CONDITION_OPTIONS = CONDITIONS.map((c) => ({
  value: c,
  label: CONDITION_LABELS[c] || c,
}));

const EMPTY_FORM: FormData = {
  title: "",
  description: "",
  category: "",
  condition: "",
  price: "",
  is_negotiable: false,
};

export default function SellPage() {
  const { user, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPopulated, setAiPopulated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listing, setListing] = useState<ListingResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const token = session?.access_token;

  // --- photo upload ---

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!user || !token) return;

      const allowed = Array.from(files).filter((f) => f.type.startsWith("image/"));
      const remaining = MAX_PHOTOS - photos.length;
      const batch = allowed.slice(0, remaining);

      if (batch.length === 0) {
        if (photos.length >= MAX_PHOTOS) toast(`Maximum ${MAX_PHOTOS} photos`, "error");
        return;
      }

      const staged: UploadedPhoto[] = batch.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        previewUrl: URL.createObjectURL(file),
        storagePath: "",
        publicUrl: "",
        uploading: true,
      }));

      setPhotos((prev) => [...prev, ...staged]);

      for (let i = 0; i < batch.length; i++) {
        const file = batch[i];
        const photo = staged[i];
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/${Date.now()}-${photo.id}.${ext}`;

        try {
          const { error } = await supabase.storage
            .from("listing_photos")
            .upload(path, file);
          if (error) throw error;

          const { data } = supabase.storage.from("listing_photos").getPublicUrl(path);

          setPhotos((prev) =>
            prev.map((p) =>
              p.id === photo.id
                ? { ...p, storagePath: path, publicUrl: data.publicUrl, uploading: false }
                : p
            )
          );
        } catch {
          toast("Failed to upload photo", "error");
          setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        }
      }
    },
    [user, token, photos.length, supabase, toast]
  );

  const removePhoto = useCallback(
    async (id: string) => {
      const photo = photos.find((p) => p.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.previewUrl);
        if (photo.storagePath) {
          supabase.storage.from("listing_photos").remove([photo.storagePath]);
        }
      }
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    },
    [photos, supabase]
  );

  // cleanup preview URLs on unmount
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => {
    return () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  // --- drag reorder ---

  const handleReorderDrop = useCallback(
    (targetIdx: number) => {
      if (dragIndex === null || dragIndex === targetIdx) return;
      setPhotos((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(targetIdx, 0, moved);
        return next;
      });
      setDragIndex(null);
    },
    [dragIndex]
  );

  // --- drop zone ---

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    },
    [uploadFiles]
  );

  // --- step transitions ---

  const goToStep2 = useCallback(async () => {
    if (photos.length === 0 || photos.some((p) => p.uploading)) return;
    setStep(2);

    if (aiPopulated) return;
    setAiLoading(true);

    try {
      const result = await api.post<{
        suggestions?: {
          title?: string;
          description?: string;
          category?: string;
          condition?: string;
          price_cents?: number;
        };
        error?: string;
      }>("/listings/ai-populate", { storage_path: photos[0].storagePath }, token);

      const s = result.suggestions;
      if (s) {
        setForm((prev) => ({
          ...prev,
          title: s.title || prev.title,
          description: s.description || prev.description,
          category: s.category || prev.category,
          condition: s.condition || prev.condition,
          price: s.price_cents ? (s.price_cents / 100).toString() : prev.price,
        }));
      }
      setAiPopulated(true);
    } catch {
      // AI unavailable — user fills manually
    } finally {
      setAiLoading(false);
    }
  }, [photos, token, aiPopulated]);

  // --- validation & submit ---

  const validate = useCallback((): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.title.trim()) e.title = "Required";
    if (!form.description.trim()) e.description = "Required";
    if (!form.category) e.category = "Required";
    if (!form.condition) e.condition = "Required";
    const p = Number(form.price);
    if (form.price === "" || isNaN(p) || p < 0) e.price = "Enter a valid price";
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        condition: form.condition,
        price_cents: Math.round(Number(form.price) * 100),
        is_negotiable: form.is_negotiable,
        photos: photos.map((p, i) => ({ order: i, path: p.storagePath })),
      };
      const result = await api.post<ListingResponse>("/listings", body, token);
      setListing(result);
      setStep(3);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create listing");
      setStep(3);
    } finally {
      setSubmitting(false);
    }
  }, [form, photos, token, validate]);

  const resetAll = () => {
    setStep(1);
    setPhotos([]);
    setForm(EMPTY_FORM);
    setErrors({});
    setListing(null);
    setSubmitError(null);
    setAiPopulated(false);
  };

  // --- render guards ---

  if (authLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-[var(--color-secondary)]">Sign in to list an item</p>
        <Button onClick={() => router.push("/login")}>Sign in</Button>
      </div>
    );
  }

  const uploading = photos.some((p) => p.uploading);

  return (
    <div className="mx-auto max-w-xl">
      {/* step indicator */}
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Sell an item
        </h1>
        <div className="mt-3 flex gap-0">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 transition-colors duration-300",
                s <= step ? "bg-[var(--color-brand)]" : "bg-[var(--color-surface-sunken)]"
              )}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-[var(--color-muted)]">
          <span className={step >= 1 ? "text-[var(--color-brand)]" : ""}>Photos</span>
          <span className={step >= 2 ? "text-[var(--color-brand)]" : ""}>Details</span>
          <span className={step >= 3 ? "text-[var(--color-brand)]" : ""}>Done</span>
        </div>
      </div>

      {/* ---- STEP 1: Upload photos ---- */}
      {step === 1 && (
        <div className="animate-fade-in">
          <div
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "cursor-pointer border-2 border-dashed p-8 text-center transition-colors duration-200",
              dragOver
                ? "border-[var(--color-brand)] bg-[var(--color-brand-subtle)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:border-[var(--color-muted)]"
            )}
          >
            <ImagePlus size={28} className="mx-auto mb-2 text-[var(--color-muted)]" />
            <p className="text-sm text-[var(--color-secondary)]">
              Drag photos here or click to browse
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Up to {MAX_PHOTOS} photos &middot; JPG, PNG, WebP
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {photos.length > 0 && (
            <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((photo, i) => (
                <div
                  key={photo.id}
                  draggable={!photo.uploading}
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleReorderDrop(i);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={cn(
                    "group relative aspect-square border border-[var(--color-border)] bg-[var(--color-surface-sunken)] overflow-hidden",
                    dragIndex === i && "opacity-40"
                  )}
                >
                  {photo.uploading ? (
                    <div className="flex h-full items-center justify-center">
                      <Spinner size="sm" />
                    </div>
                  ) : (
                    <>
                      <img
                        src={photo.previewUrl}
                        alt={`Photo ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-start justify-between p-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="flex items-center bg-black/60 px-1 py-0.5 text-white">
                          <GripVertical size={10} />
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removePhoto(photo.id);
                          }}
                          className="bg-black/60 p-0.5 text-white hover:bg-black/80"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      {i === 0 && (
                        <span className="absolute bottom-0 left-0 bg-[var(--color-brand)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                          Cover
                        </span>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="mt-2 text-right text-xs text-[var(--color-muted)]">
            {photos.length}/{MAX_PHOTOS} photos
          </p>

          <div className="mt-4 flex justify-end">
            <Button onClick={goToStep2} disabled={photos.length === 0 || uploading}>
              Next
              <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ---- STEP 2: Item details ---- */}
      {step === 2 && (
        <div className="animate-fade-in">
          {aiLoading && (
            <div className="mb-4 flex items-center gap-2 border border-[var(--color-brand-muted)] bg-[var(--color-brand-subtle)] px-3 py-2">
              <Sparkles size={14} className="text-[var(--color-brand)]" />
              <span className="text-xs text-[var(--color-brand)]">
                AI is analyzing your photo&hellip;
              </span>
              <Spinner size="sm" />
            </div>
          )}

          <div className="flex flex-col gap-4">
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="What are you selling?"
              error={errors.title}
              disabled={aiLoading}
            />

            <Textarea
              label="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe the item, condition, any defects…"
              rows={4}
              error={errors.description}
              disabled={aiLoading}
            />

            <div className="grid grid-cols-2 gap-3">
              <Dropdown
                label="Category"
                options={CATEGORY_OPTIONS}
                value={form.category}
                onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                placeholder="Select…"
                error={errors.category}
              />
              <Dropdown
                label="Condition"
                options={CONDITION_OPTIONS}
                value={form.condition}
                onChange={(v) => setForm((f) => ({ ...f, condition: v }))}
                placeholder="Select…"
                error={errors.condition}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <Input
                label="Price ($)"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="0.00"
                error={errors.price}
                disabled={aiLoading}
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_negotiable: !f.is_negotiable }))}
                className="flex h-10 items-center gap-2 border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 text-sm transition-colors hover:bg-[var(--color-surface-sunken)]"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center border transition-colors",
                    form.is_negotiable
                      ? "border-[var(--color-brand)] bg-[var(--color-brand)]"
                      : "border-[var(--color-border)]"
                  )}
                >
                  {form.is_negotiable && <Check size={10} className="text-white" />}
                </span>
                <span className="text-xs text-[var(--color-secondary)]">Negotiable</span>
              </button>
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={14} />
              Back
            </Button>
            <Button onClick={handleSubmit} loading={submitting} disabled={aiLoading}>
              Submit listing
            </Button>
          </div>
        </div>
      )}

      {/* ---- STEP 3: Confirmation ---- */}
      {step === 3 && (
        <div className="animate-fade-in flex flex-col items-center py-12 text-center">
          {listing ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center bg-[var(--color-brand-subtle)]">
                <Check size={24} className="text-[var(--color-brand)]" />
              </div>
              <h2 className="mt-4 font-[family-name:var(--font-display)] text-base font-semibold">
                Listed!
              </h2>
              <p className="mt-1 text-sm text-[var(--color-secondary)]">
                Your item is now live on DormDrop.
              </p>
              <div className="mt-6 flex gap-3">
                <Button variant="outlined" onClick={() => router.push(`/listing/${listing.id}`)}>
                  View listing
                </Button>
                <Button onClick={resetAll}>Sell another</Button>
              </div>
            </>
          ) : submitError ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center bg-[#FDECEC]">
                <AlertTriangle size={24} className="text-[var(--color-destructive)]" />
              </div>
              <h2 className="mt-4 font-[family-name:var(--font-display)] text-base font-semibold">
                Couldn&apos;t create listing
              </h2>
              <p className="mt-1 max-w-xs text-sm text-[var(--color-destructive)]">
                {submitError}
              </p>
              <div className="mt-6">
                <Button variant="outlined" onClick={() => setStep(2)}>
                  <ArrowLeft size={14} />
                  Go back &amp; fix
                </Button>
              </div>
            </>
          ) : (
            <Spinner />
          )}
        </div>
      )}
    </div>
  );
}
