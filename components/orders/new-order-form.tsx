"use client";

// New-order composer (SPEC §3.4). A full-screen, two-step takeover (DESIGN.md §4):
//   Step 1 "Items" — search, category chips, item grid, always-on scanner.
//   Step 2 "Review & pay" — cart with steppers, source/customer, discount, payment.
// The client picks items and sends ONLY menu item ids + quantities (a JSON `items`
// field). It never sends a price or a total: the server looks up stored prices and
// recomputes subtotal, commission, and total (CLAUDE.md §7.7). The figure shown here
// is an on-screen ESTIMATE from the same stored prices; the saved order uses the
// server's recomputation. Item names/prices are business data, not translated (§3).
//
// Touch-first: tapping a tile, stepper, or chip NEVER focuses a text field, so the
// soft keyboard only opens when the cashier taps search or a text input (DESIGN.md
// §4). The hardware wedge scanner captures at the document level and needs no
// focused field, so nothing is lost.
//
// Quick-add: type an item code (integer) + Enter → adds qty 1 (name-substring
// fallback). Barcode checkout: the wedge scanner is ALWAYS ON; an optional camera
// scan maps a barcode to its sold-from-stock menu item and adds a line. On order
// completion the item's stock DECREMENTS via the FT1 ledger.

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Minus,
  Plus,
  ScanBarcode,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createOrder,
  resolveScannedBarcode,
  priceScannedItemAndResolve,
  updateOrder,
  type CreateOrderState,
} from "@/app/(app)/orders/actions";
import { formatLKR } from "@/lib/format";
import {
  DISCOUNT_PCTS,
  ORDER_SOURCES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@/lib/orders/order-config";
import { INVENTORY_CATEGORIES } from "@/lib/inventory-config";
import { useBarcodeScanner } from "@/lib/hooks/use-barcode-scanner";
import { useCameraScanner, type CameraScannerError } from "@/lib/hooks/use-camera-scanner";
import type { NewOrderMenuItem } from "@/lib/db/selectors/orders";

const FIELD_CLASS =
  "border-border text-label text-ink focus-visible:ring-brand/40 h-10 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2";

/** Seed values for edit mode — read straight off OrderBillData on the detail page. */
export type OrderFormInitial = {
  source: string;
  customerName: string | null;
  paymentMethod: string | null;
  paymentStatus: string;
  discountPct: number;
  lines: { menuItemId: string | null; nameSnapshot: string; qty: number }[];
};

/**
 * create → the new-order flow (default). edit → same composer seeded from a PENDING
 * order; submits to updateOrder, which replaces the lines atomically (the RPC
 * re-guards pending-only — migration 026).
 */
export type OrderFormMode =
  | { kind: "create" }
  | { kind: "edit"; orderId: string; initial: OrderFormInitial };

export function NewOrderForm({
  menu: initialMenu,
  onDone,
  mode = { kind: "create" },
}: {
  menu: NewOrderMenuItem[];
  onDone: () => void;
  mode?: OrderFormMode;
}) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  const editInitial = mode.kind === "edit" ? mode.initial : null;

  // Two-step flow: pick items, then review & pay.
  const [step, setStep] = useState<"items" | "review">("items");

  // Menu items linked on the fly from a scanned stock barcode (§4). They aren't in
  // the server-fetched list yet, so we hold them here and merge — the picker, the
  // barcode map, and the estimate all read the merged list. Deduped by id: the
  // action's revalidation refreshes the server list mid-session, so a just-linked
  // item can arrive in initialMenu while still sitting in extraItems (AUDIT 1.4).
  const [extraItems, setExtraItems] = useState<NewOrderMenuItem[]>([]);
  const menu = useMemo(() => {
    if (extraItems.length === 0) return initialMenu;
    const known = new Set(initialMenu.map((m) => m.id));
    const novel = extraItems.filter((m) => !known.has(m.id));
    return novel.length === 0 ? initialMenu : [...initialMenu, ...novel];
  }, [initialMenu, extraItems]);

  // Canonical integer qty per menu item (0 = not in order). Edit mode seeds it
  // from the order's lines — only lines whose menu item still exists in the
  // picker (deleted/unavailable ones are surfaced below, not silently kept:
  // the RPC would reject them on save).
  const [qtyById, setQtyById] = useState<Record<string, number>>(() => {
    if (!editInitial) return {};
    const known = new Set(initialMenu.map((m) => m.id));
    const init: Record<string, number> = {};
    for (const l of editInitial.lines) {
      if (l.menuItemId && known.has(l.menuItemId)) {
        init[l.menuItemId] = (init[l.menuItemId] ?? 0) + l.qty;
      }
    }
    return init;
  });
  // Raw string values for the editable qty text inputs (CF2: never sanitize mid-type).
  const [qtyRaw, setQtyRaw] = useState<Record<string, string>>({});
  // Edit mode: order lines that can't be carried into the cart (menu item
  // deleted or no longer available) — named so the cashier can re-add manually.
  const droppedNames = useMemo(() => {
    if (!editInitial) return [];
    const known = new Set(initialMenu.map((m) => m.id));
    return editInitial.lines
      .filter((l) => !l.menuItemId || !known.has(l.menuItemId))
      .map((l) => l.nameSnapshot);
    // Snapshot of the mount-time menu is intentional — matches the qty seeding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Quick-add / search query.
  const [quickAdd, setQuickAdd] = useState("");
  // Category chip filter (null = all). A fast touch path alongside search.
  const [category, setCategory] = useState<string | null>(null);
  // Item picker layout: an image grid (pick by picture, CF1 photos) or the dense
  // list. Both share the same search + add/qty machinery; grid is the default so
  // the client can pick by picture, list stays a tap away for fast keying.
  const [view, setView] = useState<"grid" | "list">("grid");
  // Whole-order quick discount (0 = none). The server RECOMPUTES the actual
  // discount + net total from stored prices; this is only the selected rate and
  // the on-screen estimate (CLAUDE.md §7.7).
  const [discountPct, setDiscountPct] = useState<number>(editInitial?.discountPct ?? 0);

  // Order metadata — controlled so it survives switching between steps (an
  // uncontrolled select would reset to its default on remount). Submitted via
  // their `name` attributes on step 2, where the submit button lives.
  const [source, setSource] = useState<string>(editInitial?.source ?? ORDER_SOURCES[0]);
  const [customerName, setCustomerName] = useState<string>(editInitial?.customerName ?? "");
  const [paymentMethod, setPaymentMethod] = useState<string>(
    editInitial?.paymentMethod ?? PAYMENT_METHODS[0],
  );
  const [paymentStatus, setPaymentStatus] = useState<string>(
    editInitial?.paymentStatus ?? PAYMENT_STATUSES[0],
  );

  // Barcode checkout state. The wedge scanner is always on; the camera is optional.
  const [scanMsg, setScanMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  // A scanned stock item with no retail price yet — prompt for one inline at the
  // till (set price + bill in one step) instead of sending the cashier to
  // Inventory. Holds the barcode + name of the item awaiting a price.
  const [pricePrompt, setPricePrompt] = useState<{ code: string; name: string } | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [pricePending, setPricePending] = useState(false);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [camError, setCamError] = useState<CameraScannerError | null>(null);
  const [camAttempt, setCamAttempt] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // barcode → menu item id, for sold-from-stock items (finished_good / merchandise).
  const menuByBarcode = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of menu) if (m.barcode) map.set(m.barcode, m.id);
    return map;
  }, [menu]);

  // Categories present in the menu, in the fixed enum order — drives the chip rail.
  const categories = useMemo(() => {
    const present = new Set(menu.map((m) => m.category).filter(Boolean) as string[]);
    return INVENTORY_CATEGORIES.filter((c) => present.has(c));
  }, [menu]);

  // One form, two mutations: create posts to createOrder; edit binds the order
  // id onto updateOrder (mode never changes over the component's life).
  const submitAction = useMemo(
    () => (mode.kind === "edit" ? updateOrder.bind(null, mode.orderId) : createOrder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [state, formAction, pending] = useActionState<CreateOrderState, FormData>(
    submitAction,
    {},
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  // Filter menu by category chip + quick-add query: pure integer → code lookup
  // (with name fallback), anything else → name substring.
  const filteredMenu = useMemo(() => {
    const base = category ? menu.filter((m) => m.category === category) : menu;
    const q = quickAdd.trim();
    if (!q) return base;
    const asInt = parseInt(q, 10);
    if (!isNaN(asInt) && asInt > 0 && String(asInt) === q) {
      const byCode = base.filter((m) => m.itemCode === asInt);
      if (byCode.length > 0) return byCode;
    }
    const lower = q.toLowerCase();
    return base.filter((m) => m.name.toLowerCase().includes(lower));
  }, [menu, quickAdd, category]);

  // Add one of `id` to the cart. Functional update so repeat scans of the same
  // code increment correctly (a captured closure would otherwise read a stale qty);
  // the raw override is cleared so the input falls back to the canonical qty.
  // Deliberately does NOT refocus search — a tile tap must not pop the keyboard.
  // It also does NOT clear the search box: after tapping a result the cashier wants
  // the same filtered tile in front of them to bump the qty, not the whole menu
  // snapping back. Scan paths clear the query themselves (leaked first char).
  const addItem = useCallback((id: string) => {
    setQtyById((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    setQtyRaw((prev) => {
      if (prev[id] === undefined) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }, []);

  // Remove a line from the order entirely (cart trash button).
  function removeLine(id: string) {
    setQtyById((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setQtyRaw((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  function clearCart() {
    setQtyById({});
    setQtyRaw({});
  }

  // Merge a server-resolved menu item into the picker (deduped) and add it to the
  // cart. Shared by the plain scan and the price-at-till confirm.
  const addResolvedItem = useCallback(
    (item: NewOrderMenuItem) => {
      setExtraItems((prev) => (prev.some((m) => m.id === item.id) ? prev : [...prev, item]));
      addItem(item.id);
      // A scan may have leaked its first character into a focused search box.
      setQuickAdd("");
    },
    [addItem],
  );

  // Add a menu item from a scanned barcode (wedge or camera). Dedupe identical
  // reads within a short window so a camera held on one code (many frames) or a
  // double-trigger doesn't spam the cart; a deliberate re-scan after the window
  // increments the qty. An unknown barcode is surfaced, not silently dropped.
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const addByBarcode = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const now = Date.now();
      if (lastScanRef.current.code === code && now - lastScanRef.current.at < 1200) return;
      lastScanRef.current = { code, at: now };

      const id = menuByBarcode.get(code);
      if (id) {
        addItem(id);
        // A scan may have leaked its first character into a focused search box.
        setQuickAdd("");
        const name = menu.find((m) => m.id === id)?.name ?? "";
        setScanMsg({ tone: "ok", text: t("orders.new.scanAdded", { name }) });
        return;
      }

      // Not on the menu yet — resolve against Stock. The server links the barcode's
      // stock row to a sold-from-stock menu item (creating one if needed) and hands
      // it back so we can bill it here and show it in the picker.
      setScanMsg({ tone: "ok", text: t("orders.new.scanLooking", { code }) });
      const res = await resolveScannedBarcode(code);
      if (res.status === "found") {
        addResolvedItem(res.item);
        setScanMsg({ tone: "ok", text: t("orders.new.scanAdded", { name: res.item.name }) });
      } else if (res.status === "no_price") {
        // No retail price yet — open the inline price prompt so the cashier can
        // set it and sell in one step, instead of a dead-end warning.
        setQuickAdd("");
        setScanMsg(null);
        setPriceInput("");
        setPricePrompt({ code, name: res.name });
      } else if (res.status === "unavailable") {
        setScanMsg({ tone: "warn", text: t("orders.new.scanUnavailable", { name: res.name }) });
      } else {
        // Clear any first-character leak from the focused search box, then warn.
        setQuickAdd("");
        setScanMsg({ tone: "warn", text: t("orders.new.scanUnknown", { code }) });
      }
    },
    [menuByBarcode, menu, addItem, addResolvedItem, t],
  );

  // Confirm the inline price prompt: set the price on stock + bill the item.
  const confirmPrice = useCallback(async () => {
    if (!pricePrompt) return;
    const major = Number(priceInput);
    if (!isFinite(major) || major <= 0) {
      setScanMsg({ tone: "warn", text: t("orders.new.scanPriceInvalid") });
      return;
    }
    setPricePending(true);
    const res = await priceScannedItemAndResolve(pricePrompt.code, major);
    setPricePending(false);
    if (res.status === "found") {
      addResolvedItem(res.item);
      setScanMsg({ tone: "ok", text: t("orders.new.scanAdded", { name: res.item.name }) });
      setPricePrompt(null);
      setPriceInput("");
    } else {
      setScanMsg({ tone: "warn", text: t("orders.new.scanPriceFailed") });
    }
  }, [pricePrompt, priceInput, addResolvedItem, t]);

  // Keyboard-wedge scanner — ALWAYS ON, and captures even while the search box is
  // focused (billing counter). The camera path is optional (toggle below).
  useBarcodeScanner({ onScan: addByBarcode, captureInEditable: true });
  useCameraScanner({
    videoRef,
    enabled: cameraOn,
    restartKey: camAttempt,
    onDecode: addByBarcode,
    onError: (e) => setCamError(e),
  });

  function bump(id: string, delta: number) {
    const next = Math.max(0, (qtyById[id] ?? 0) + delta);
    setQtyById((prev) => {
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
    setQtyRaw((prev) => {
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = String(next);
      return copy;
    });
  }

  function handleQtyChange(id: string, raw: string) {
    setQtyRaw((prev) => ({ ...prev, [id]: raw }));
  }

  function commitQty(id: string) {
    const parsed = parseInt(qtyRaw[id] ?? "", 10);
    if (!isFinite(parsed) || parsed <= 0) {
      setQtyById((prev) => {
        const c = { ...prev };
        delete c[id];
        return c;
      });
      setQtyRaw((prev) => {
        const c = { ...prev };
        delete c[id];
        return c;
      });
    } else {
      setQtyById((prev) => ({ ...prev, [id]: parsed }));
      setQtyRaw((prev) => ({ ...prev, [id]: String(parsed) }));
    }
  }

  const lines = useMemo(
    () => Object.entries(qtyById).map(([menuItemId, qty]) => ({ menuItemId, qty })),
    [qtyById],
  );

  // The order's current lines, resolved to name + price for the cart summary.
  const cartLines = useMemo(() => {
    const byId = new Map(menu.map((m) => [m.id, m]));
    return lines.map((l) => {
      const m = byId.get(l.menuItemId);
      return {
        id: l.menuItemId,
        name: m?.name ?? "",
        itemCode: m?.itemCode,
        priceCents: m?.priceCents ?? 0,
        qty: l.qty,
      };
    });
  }, [lines, menu]);

  // On-screen estimate only — the server recomputes the authoritative total.
  const estimatedCents = useMemo(() => {
    const priceById = new Map(menu.map((m) => [m.id, m.priceCents]));
    return lines.reduce((sum, l) => sum + (priceById.get(l.menuItemId) ?? 0) * l.qty, 0);
  }, [lines, menu]);

  const itemsJson = JSON.stringify(lines);
  const totalQty = lines.reduce((n, l) => n + l.qty, 0);
  const hasItems = lines.length > 0;

  // On-screen discount/net estimate. Round-half-up on positive cents matches the
  // server's round(subtotal × pct / 100). Authoritative figures come from the RPC.
  const discountCents = Math.round((estimatedCents * discountPct) / 100);
  const netCents = estimatedCents - discountCents;

  const composerTitle =
    step === "review"
      ? t("orders.new.reviewTitle")
      : mode.kind === "edit"
        ? t("orders.edit.action")
        : t("orders.new.title");

  return (
    <div
      className="bg-surface fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={composerTitle}
    >
      <form action={formAction} className="mx-auto flex h-full max-w-[430px] flex-col">
        {/* Header — X closes on step 1, back-arrow returns to items on step 2 */}
        <header className="border-border flex h-14 shrink-0 items-center gap-1 border-b px-2">
          <button
            type="button"
            onClick={step === "review" ? () => setStep("items") : onDone}
            aria-label={step === "review" ? t("orders.new.back") : t("orders.new.close")}
            className="text-muted hover:text-ink hover:bg-surface-2 flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] transition-colors"
          >
            {step === "review" ? (
              <ArrowLeft className="size-5" aria-hidden />
            ) : (
              <X className="size-5" aria-hidden />
            )}
          </button>
          <h2 className="text-h2 text-ink font-semibold">{composerTitle}</h2>
          {hasItems ? (
            <span className="text-caption text-muted ml-auto pr-2 tabular-nums">
              {t("orders.new.itemsCount", { count: totalQty })}
            </span>
          ) : null}
        </header>

        {/* Scrollable body */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {step === "items" ? (
            <>
              {/* Barcode checkout — wedge scanner always on; camera optional */}
              <div className="border-border bg-surface-2 flex flex-col gap-2 rounded-[var(--radius)] border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-caption text-muted inline-flex items-center gap-1.5">
                    <ScanBarcode className="size-4" aria-hidden />
                    {t("orders.new.scanReady")}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCamError(null);
                      setCameraOn((v) => !v);
                      setCamAttempt((a) => a + 1);
                    }}
                    aria-pressed={cameraOn}
                    className={`text-caption inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] border px-2.5 font-medium transition-colors ${
                      cameraOn
                        ? "border-brand text-brand bg-[var(--red-tint)]"
                        : "border-border-strong text-ink hover:bg-surface"
                    }`}
                  >
                    <Camera className="size-3.5" aria-hidden />
                    {cameraOn ? t("orders.new.scanCameraOff") : t("orders.new.scanCameraOn")}
                  </button>
                </div>

                {cameraOn && !camError ? (
                  <div className="border-border relative aspect-video overflow-hidden rounded-[var(--radius)] border bg-black">
                    <video
                      ref={videoRef}
                      className="size-full object-cover"
                      playsInline
                      muted
                      aria-label={t("inventory.scan.viewfinderLabel")}
                    />
                    <div
                      className="border-brand-white/80 pointer-events-none absolute inset-6 rounded-[var(--radius)] border-2"
                      aria-hidden
                    />
                  </div>
                ) : null}

                {camError ? (
                  <p role="alert" className="text-caption text-danger">
                    {t(`inventory.scan.error.${camError}`)}
                  </p>
                ) : null}

                {scanMsg ? (
                  <p
                    role="status"
                    className={`text-caption ${scanMsg.tone === "ok" ? "text-success" : "text-danger"}`}
                  >
                    {scanMsg.text}
                  </p>
                ) : null}

                {/* Inline price prompt — a scanned item with no retail price yet. */}
                {pricePrompt ? (
                  <div className="border-border bg-surface flex flex-col gap-2 rounded-[var(--radius)] border p-2.5">
                    <span className="text-caption text-ink">
                      {t("orders.new.scanPricePrompt", { name: pricePrompt.name })}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        ref={priceInputRef}
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            confirmPrice();
                          }
                          if (e.key === "Escape") {
                            setPricePrompt(null);
                            setPriceInput("");
                          }
                        }}
                        placeholder={t("orders.new.scanPricePlaceholder")}
                        aria-label={t("orders.new.scanPricePrompt", { name: pricePrompt.name })}
                        className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 flex-1 rounded-[var(--radius)] border px-2 tabular-nums outline-none focus-visible:ring-2"
                      />
                      <button
                        type="button"
                        onClick={confirmPrice}
                        disabled={pricePending}
                        className="bg-brand text-brand-white hover:bg-brand-ember text-caption h-9 shrink-0 rounded-[var(--radius)] px-3 font-semibold transition-colors disabled:opacity-50"
                      >
                        {pricePending ? t("orders.new.scanPriceSaving") : t("orders.new.scanPriceAdd")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPricePrompt(null);
                          setPriceInput("");
                        }}
                        aria-label={t("orders.new.scanPriceCancel")}
                        className="text-muted hover:text-ink h-9 shrink-0 transition-colors"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {menu.length === 0 ? (
                <p className="text-caption text-muted py-1">{t("orders.new.noMenu")}</p>
              ) : (
                <>
                  {/* Code / name search */}
                  <div className="relative">
                    <Search
                      className="text-muted absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                      aria-hidden
                    />
                    <input
                      ref={searchRef}
                      type="text"
                      value={quickAdd}
                      onChange={(e) => setQuickAdd(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const first = filteredMenu[0];
                          if (first) addItem(first.id);
                        }
                      }}
                      placeholder={t("orders.new.searchPlaceholder")}
                      className={`${FIELD_CLASS} w-full pl-8 ${quickAdd ? "pr-8" : ""}`}
                    />
                    {quickAdd ? (
                      <button
                        type="button"
                        onClick={() => {
                          setQuickAdd("");
                          searchRef.current?.focus({ preventScroll: true });
                        }}
                        aria-label={t("orders.new.clearSearch")}
                        className="text-muted hover:text-ink absolute top-1/2 right-2.5 -translate-y-1/2 transition-colors"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    ) : null}
                  </div>

                  {/* Category chips + view toggle */}
                  <div className="flex items-center gap-2">
                    {categories.length > 1 ? (
                      <div className="-mx-4 flex flex-1 gap-1.5 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                        {[null, ...categories].map((c) => {
                          const active = category === c;
                          return (
                            <button
                              key={c ?? "__all"}
                              type="button"
                              onClick={() => setCategory(c)}
                              aria-pressed={active}
                              className={`text-caption h-8 shrink-0 rounded-[var(--radius-pill)] border px-3 font-medium transition-colors ${
                                active
                                  ? "border-brand text-brand bg-[var(--red-tint)]"
                                  : "border-border-strong text-ink hover:bg-surface-2"
                              }`}
                            >
                              {c ? t(`inventory.category.${c}`) : t("orders.new.allCategories")}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="flex-1" />
                    )}
                    <div
                      role="group"
                      aria-label={t("orders.new.viewToggle")}
                      className="border-border inline-flex shrink-0 rounded-[var(--radius)] border p-0.5"
                    >
                      {(["grid", "list"] as const).map((v) => {
                        const active = view === v;
                        const Icon = v === "grid" ? LayoutGrid : List;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setView(v)}
                            aria-pressed={active}
                            aria-label={t(`orders.new.view.${v}`)}
                            className={`flex size-7 items-center justify-center rounded-[calc(var(--radius)-4px)] transition-colors ${
                              active ? "bg-[var(--red-tint)] text-brand" : "text-muted hover:text-ink"
                            }`}
                          >
                            <Icon className="size-4" aria-hidden />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Item picker */}
                  {filteredMenu.length === 0 ? (
                    <p className="text-caption text-muted py-1">
                      {t("orders.new.noMatch", { query: quickAdd.trim() })}
                    </p>
                  ) : view === "list" ? (
                    <ul className="border-border divide-border divide-y rounded-[var(--radius)] border">
                      {filteredMenu.map((m) => {
                        const qty = qtyById[m.id] ?? 0;
                        const inCart = qty > 0;
                        return (
                          <li
                            key={m.id}
                            className={`flex items-center gap-2 px-2 py-1.5 transition-colors ${
                              inCart ? "bg-[var(--red-tint)]" : ""
                            }`}
                          >
                            <span className="text-caption text-muted w-7 shrink-0 text-right tabular-nums">
                              #{m.itemCode}
                            </span>
                            <button
                              type="button"
                              onClick={() => addItem(m.id)}
                              className="flex min-w-0 flex-1 flex-col text-left"
                            >
                              <span
                                className={`text-label truncate ${
                                  inCart ? "text-ink font-semibold" : "text-ink"
                                }`}
                              >
                                {m.name}
                              </span>
                              <span className="text-caption text-muted tabular-nums">
                                {formatLKR(m.priceCents)}
                              </span>
                            </button>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => bump(m.id, -1)}
                                disabled={!inCart}
                                aria-label={t("orders.new.decrease", { name: m.name })}
                                className="border-border-strong text-ink hover:bg-surface-2 flex size-7 items-center justify-center rounded-[var(--radius)] border disabled:opacity-30"
                              >
                                <Minus className="size-3.5" aria-hidden />
                              </button>
                              {inCart ? (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={qtyRaw[m.id] ?? String(qty)}
                                  onChange={(e) => handleQtyChange(m.id, e.target.value)}
                                  onBlur={() => commitQty(m.id)}
                                  onFocus={(e) => e.currentTarget.select()}
                                  aria-label={t("orders.new.qtyFor", { name: m.name })}
                                  className="border-border focus-visible:ring-brand/40 text-label text-ink h-7 w-9 rounded border text-center tabular-nums outline-none focus-visible:ring-2"
                                />
                              ) : (
                                <span className="text-faint w-9 text-center text-sm tabular-nums">
                                  —
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => bump(m.id, 1)}
                                aria-label={t("orders.new.increase", { name: m.name })}
                                className="border-border-strong text-ink hover:bg-surface-2 flex size-7 items-center justify-center rounded-[var(--radius)] border"
                              >
                                <Plus className="size-3.5" aria-hidden />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    /* Image grid — pick by picture. Orientation-aware columns
                       (DESIGN.md §4). Tapping the image/name adds 1; the footer
                       stepper handles the rest. Missing photos fall back to a
                       placeholder tile. */
                    <ul className="grid grid-cols-2 gap-2 landscape:grid-cols-3 min-[520px]:grid-cols-4">
                      {filteredMenu.map((m) => {
                        const qty = qtyById[m.id] ?? 0;
                        const inCart = qty > 0;
                        return (
                          <li
                            key={m.id}
                            className={`flex flex-col overflow-hidden rounded-[var(--radius)] border transition-colors ${
                              inCart
                                ? "border-brand bg-[var(--red-tint)]"
                                : "border-border hover:bg-surface-2"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => addItem(m.id)}
                              aria-label={t("orders.new.increase", { name: m.name })}
                              className="flex w-full flex-col text-left"
                            >
                              <div className="bg-surface-2 aspect-square w-full">
                                {m.imageUrl ? (
                                  // Private bucket → short-lived signed URL; a plain img keeps
                                  // us off next/image remote-host config for ephemeral URLs.
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={m.imageUrl}
                                    alt=""
                                    loading="lazy"
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  <span className="text-faint flex size-full items-center justify-center">
                                    <ImageIcon className="size-7" aria-hidden />
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col gap-0.5 p-2">
                                <span
                                  className={`text-label line-clamp-2 ${
                                    inCart ? "text-ink font-semibold" : "text-ink"
                                  }`}
                                >
                                  {m.name}
                                </span>
                                <span className="text-caption text-muted tabular-nums">
                                  #{m.itemCode} · {formatLKR(m.priceCents)}
                                </span>
                              </div>
                            </button>

                            {inCart ? (
                              <div className="flex items-center justify-center gap-1 px-2 pb-2">
                                <button
                                  type="button"
                                  onClick={() => bump(m.id, -1)}
                                  aria-label={t("orders.new.decrease", { name: m.name })}
                                  className="border-border-strong text-ink hover:bg-surface flex size-7 items-center justify-center rounded-[var(--radius)] border"
                                >
                                  <Minus className="size-3.5" aria-hidden />
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={qtyRaw[m.id] ?? String(qty)}
                                  onChange={(e) => handleQtyChange(m.id, e.target.value)}
                                  onBlur={() => commitQty(m.id)}
                                  onFocus={(e) => e.currentTarget.select()}
                                  aria-label={t("orders.new.qtyFor", { name: m.name })}
                                  className="border-border focus-visible:ring-brand/40 text-label text-ink h-7 w-9 rounded border text-center tabular-nums outline-none focus-visible:ring-2"
                                />
                                <button
                                  type="button"
                                  onClick={() => bump(m.id, 1)}
                                  aria-label={t("orders.new.increase", { name: m.name })}
                                  className="border-border-strong text-ink hover:bg-surface flex size-7 items-center justify-center rounded-[var(--radius)] border"
                                >
                                  <Plus className="size-3.5" aria-hidden />
                                </button>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {/* Edit mode: order lines that couldn't be carried over. */}
              {droppedNames.length > 0 ? (
                <p role="alert" className="text-caption text-danger">
                  {t("orders.edit.droppedLines", { names: droppedNames.join(", ") })}
                </p>
              ) : null}

              {/* Current order (cart) — every added/scanned line with its own stepper */}
              {cartLines.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-label text-ink font-semibold">
                      {t("orders.new.cart")} · {t("orders.new.itemsCount", { count: totalQty })}
                    </span>
                    <button
                      type="button"
                      onClick={clearCart}
                      className="text-caption text-muted hover:text-danger transition-colors"
                    >
                      {t("orders.new.clearCart")}
                    </button>
                  </div>
                  <ul className="border-border divide-border bg-surface divide-y rounded-[var(--radius)] border">
                    {cartLines.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 px-2.5 py-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-label text-ink block truncate">{c.name}</span>
                          <span className="text-caption text-muted tabular-nums">
                            {formatLKR(c.priceCents)} × {c.qty} = {formatLKR(c.priceCents * c.qty)}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => bump(c.id, -1)}
                            aria-label={t("orders.new.decrease", { name: c.name })}
                            className="border-border-strong text-ink hover:bg-surface-2 flex size-8 items-center justify-center rounded-[var(--radius)] border"
                          >
                            <Minus className="size-4" aria-hidden />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={qtyRaw[c.id] ?? String(c.qty)}
                            onChange={(e) => handleQtyChange(c.id, e.target.value)}
                            onBlur={() => commitQty(c.id)}
                            onFocus={(e) => e.currentTarget.select()}
                            aria-label={t("orders.new.qtyFor", { name: c.name })}
                            className="border-border focus-visible:ring-brand/40 text-label text-ink h-8 w-10 rounded border text-center tabular-nums outline-none focus-visible:ring-2"
                          />
                          <button
                            type="button"
                            onClick={() => bump(c.id, 1)}
                            aria-label={t("orders.new.increase", { name: c.name })}
                            className="border-border-strong text-ink hover:bg-surface-2 flex size-8 items-center justify-center rounded-[var(--radius)] border"
                          >
                            <Plus className="size-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLine(c.id)}
                            aria-label={t("orders.new.removeLine", { name: c.name })}
                            className="text-muted hover:text-danger ml-0.5 flex size-8 items-center justify-center transition-colors"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Source + customer */}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-caption text-muted">{t("orders.new.source")}</span>
                  <select
                    name="source"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    {ORDER_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {t(`source.${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-caption text-muted">{t("orders.new.customer")}</span>
                  <input
                    type="text"
                    name="customerName"
                    maxLength={120}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={t("orders.new.customerPlaceholder")}
                    className={FIELD_CLASS}
                  />
                </label>
              </div>

              {/* Quick discount — server recomputes the net total */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-caption text-muted mr-auto">{t("orders.new.discount")}</span>
                {DISCOUNT_PCTS.map((pct) => {
                  const active = discountPct === pct;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscountPct(pct)}
                      aria-pressed={active}
                      className={`text-caption h-8 min-w-[44px] rounded-[var(--radius)] border px-2.5 font-medium transition-colors ${
                        active
                          ? "border-brand text-brand bg-[var(--red-tint)]"
                          : "border-border-strong text-ink hover:bg-surface-2"
                      }`}
                    >
                      {pct === 0 ? t("orders.new.discountNone") : t("orders.new.discountPct", { pct })}
                    </button>
                  );
                })}
              </div>

              {/* Payment method + status */}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-caption text-muted">{t("orders.new.paymentMethod")}</span>
                  <select
                    name="paymentMethod"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {t(`orders.payment.${m}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-caption text-muted">{t("orders.new.paymentStatus")}</span>
                  <select
                    name="paymentStatus"
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    {PAYMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`orders.paymentStatus.${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Estimated total — server recomputes the authoritative figure */}
              <div className="bg-surface-2 flex flex-col gap-1 rounded-[var(--radius)] px-3 py-2">
                {discountPct > 0 ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-caption text-muted">{t("orders.bill.subtotal")}</span>
                      <span className="text-caption text-ink tabular-nums">
                        {formatLKR(estimatedCents)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-caption text-muted">
                        {t("orders.bill.discount", { pct: discountPct })}
                      </span>
                      <span className="text-brand-ember text-caption tabular-nums">
                        - {formatLKR(discountCents)}
                      </span>
                    </div>
                  </>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-caption text-muted">
                    {t("orders.new.estTotal")} · {t("orders.new.itemsCount", { count: totalQty })}
                  </span>
                  <span className="text-label text-ink font-semibold tabular-nums">
                    {formatLKR(netCents)}
                  </span>
                </div>
              </div>

              {state.error ? (
                <p role="alert" className="text-caption text-danger">
                  {t(state.error)}
                </p>
              ) : null}
            </>
          )}
        </div>

        <input type="hidden" name="items" value={itemsJson} readOnly />
        <input type="hidden" name="discountPct" value={discountPct} readOnly />

        {/* Sticky action bar — running total + the step's forward CTA (DESIGN.md §4).
            The two CTAs carry distinct keys so React never reconciles them into one
            reused <button> node: mutating type="button"->"submit" on the SAME node
            mid-click lets the browser's default action submit the form as the step
            flips, firing createOrder before the cashier ever reviews (phantom
            submit). Distinct keys force a fresh node per step. */}
        <div className="border-border bg-surface shrink-0 border-t px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {step === "items" ? (
            <button
              key="to-review"
              type="button"
              disabled={!hasItems}
              onClick={() => setStep("review")}
              className="bg-brand text-brand-white hover:bg-brand-ember text-label flex h-12 w-full items-center justify-between rounded-[var(--radius)] px-4 font-semibold transition-colors disabled:opacity-50"
            >
              <span className="tabular-nums">{formatLKR(netCents)}</span>
              <span className="inline-flex items-center gap-1.5">
                {t("orders.new.reviewPay")}
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </button>
          ) : (
            <button
              key="submit-order"
              type="submit"
              disabled={pending || !hasItems}
              className="bg-brand text-brand-white text-label hover:bg-brand-ember h-12 w-full rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
            >
              {mode.kind === "edit"
                ? pending
                  ? t("orders.edit.saving")
                  : t("orders.edit.save")
                : pending
                  ? t("orders.new.saving")
                  : `${t("orders.new.charge")} ${formatLKR(netCents)}`}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
