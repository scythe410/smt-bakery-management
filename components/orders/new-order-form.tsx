"use client";

// New-order form (SPEC §3.4). The client picks a source, optional customer,
// payment method/status, and menu lines with quantities — and sends ONLY the
// menu item ids + quantities (a JSON `items` field). It never sends a price or a
// total: the server looks up stored prices and recomputes subtotal, commission,
// and total (CLAUDE.md §7.7). The figure shown here is an on-screen ESTIMATE from
// the same stored prices for UX; it is explicitly labelled as such, and the saved
// order uses the server's recomputation. Item names/prices are business data,
// shown as entered/stored — not translated (CLAUDE.md §3).
//
// Quick-add: cashier types an item code (integer) and presses Enter — the item is
// added with qty 1. Falls back to name-substring search if no code matches.
// Qty for in-cart items is directly editable (CF2 pattern: type="text").
//
// Barcode checkout: the scanner is ALWAYS ON here (CLAUDE.md §4). A USB/Bluetooth
// keyboard-wedge scan (useBarcodeScanner, captureInEditable so it works even with
// the search box focused) OR an optional camera scan maps the barcode to its
// sold-from-stock menu item and adds a line (qty increments on repeat scans of the
// same item). On order completion the item's stock DECREMENTS via the FT1 ledger.

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Minus,
  Plus,
  ScanBarcode,
  Search,
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
 * create → the new-order flow (default). edit → same form seeded from a PENDING
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
  // Item picker layout: an image grid (pick by picture, CF1 photos) or the dense
  // list. Both share the same search + add/qty machinery; grid is the default so
  // the client can pick by picture, list stays a tap away for fast keying.
  const [view, setView] = useState<"grid" | "list">("grid");
  // Whole-order quick discount (0 = none). The server RECOMPUTES the actual
  // discount + net total from stored prices; this is only the selected rate and
  // the on-screen estimate (CLAUDE.md §7.7).
  const [discountPct, setDiscountPct] = useState<number>(editInitial?.discountPct ?? 0);

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

  // Filter menu by quick-add query: pure integer → code lookup (with name fallback),
  // anything else → name substring.
  const filteredMenu = useMemo(() => {
    const q = quickAdd.trim();
    if (!q) return menu;
    const asInt = parseInt(q, 10);
    if (!isNaN(asInt) && asInt > 0 && String(asInt) === q) {
      const byCode = menu.filter((m) => m.itemCode === asInt);
      if (byCode.length > 0) return byCode;
    }
    const lower = q.toLowerCase();
    return menu.filter((m) => m.name.toLowerCase().includes(lower));
  }, [menu, quickAdd]);

  // Add one of `id` to the cart. Functional update so repeat scans of the same
  // code increment correctly (a captured closure would otherwise read a stale qty);
  // the raw override is cleared so the input falls back to the canonical qty.
  const addItem = useCallback((id: string) => {
    setQtyById((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    setQtyRaw((prev) => {
      if (prev[id] === undefined) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setQuickAdd("");
    searchRef.current?.focus();
  }, []);

  // Merge a server-resolved menu item into the picker (deduped) and add it to the
  // cart. Shared by the plain scan and the price-at-till confirm.
  const addResolvedItem = useCallback(
    (item: NewOrderMenuItem) => {
      setExtraItems((prev) => (prev.some((m) => m.id === item.id) ? prev : [...prev, item]));
      addItem(item.id);
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
      searchRef.current?.focus();
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

  // On-screen estimate only — the server recomputes the authoritative total.
  const estimatedCents = useMemo(() => {
    const priceById = new Map(menu.map((m) => [m.id, m.priceCents]));
    return lines.reduce((sum, l) => sum + (priceById.get(l.menuItemId) ?? 0) * l.qty, 0);
  }, [lines, menu]);

  const itemsJson = JSON.stringify(lines);
  const totalQty = lines.reduce((n, l) => n + l.qty, 0);

  // On-screen discount/net estimate. Round-half-up on positive cents matches the
  // server's round(subtotal × pct / 100). Authoritative figures come from the RPC.
  const discountCents = Math.round((estimatedCents * discountPct) / 100);
  const netCents = estimatedCents - discountCents;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* Source + customer */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("orders.new.source")}</span>
          <select
            name="source"
            defaultValue={editInitial?.source ?? ORDER_SOURCES[0]}
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
            defaultValue={editInitial?.customerName ?? ""}
            placeholder={t("orders.new.customerPlaceholder")}
            className={FIELD_CLASS}
          />
        </label>
      </div>

      {/* Edit mode: order lines that couldn't be carried over (item deleted or
          unavailable) — the RPC would reject them, so they're named instead. */}
      {droppedNames.length > 0 ? (
        <p role="alert" className="text-caption text-danger">
          {t("orders.edit.droppedLines", { names: droppedNames.join(", ") })}
        </p>
      ) : null}

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

        {/* Inline price prompt — a scanned item with no retail price yet. Set it
            here and it's saved to stock + billed in one step (no trip to
            Inventory). */}
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

      {/* Quick-add / item picker */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-caption text-muted">{t("orders.new.items")}</span>
          {menu.length > 0 ? (
            <div
              role="group"
              aria-label={t("orders.new.viewToggle")}
              className="border-border inline-flex rounded-[var(--radius)] border p-0.5"
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
          ) : null}
        </div>

        {menu.length === 0 ? (
          <p className="text-caption text-muted py-1">{t("orders.new.noMenu")}</p>
        ) : (
          <>
            {/* Code / name search bar */}
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
                className={`${FIELD_CLASS} pl-8 ${quickAdd ? "pr-8" : ""}`}
              />
              {quickAdd ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuickAdd("");
                    searchRef.current?.focus();
                  }}
                  aria-label={t("orders.new.clearSearch")}
                  className="text-muted hover:text-ink absolute top-1/2 right-2.5 -translate-y-1/2 transition-colors"
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>

            {/* Item picker — no max-h, page scroll handles overflow */}
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
                      {/* Item code chip */}
                      <span className="text-caption text-muted w-7 shrink-0 text-right tabular-nums">
                        #{m.itemCode}
                      </span>

                      {/* Name + price — tap to add 1 */}
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

                      {/* Stepper — shows qty input when in cart */}
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
                          <span className="text-faint w-9 text-center text-sm tabular-nums">—</span>
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
              /* Image grid — pick by picture. Orientation-aware columns so it lays
                 out well in landscape / on wider frames while staying usable in
                 portrait (DESIGN.md §4). Tapping the image/name adds 1; the
                 minus/qty-input/plus footer (same stepper as the list view,
                 including a typeable qty field) handles the rest. Missing
                 photos fall back to a placeholder tile. */
              <ul className="grid grid-cols-2 gap-2 landscape:grid-cols-3 min-[520px]:grid-cols-4">
                {filteredMenu.map((m) => {
                  const qty = qtyById[m.id] ?? 0;
                  const inCart = qty > 0;
                  return (
                    <li
                      key={m.id}
                      className={`flex flex-col overflow-hidden rounded-[var(--radius)] border transition-colors ${
                        inCart ? "border-brand bg-[var(--red-tint)]" : "border-border hover:bg-surface-2"
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
      </div>

      {/* Quick discount — applied to the subtotal; server recomputes the net total */}
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

      {/* Estimated total — server recomputes the authoritative figure on save */}
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

      {/* Payment method + status (below items — cashier picks items first) */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("orders.new.paymentMethod")}</span>
          <select
            name="paymentMethod"
            defaultValue={editInitial?.paymentMethod ?? PAYMENT_METHODS[0]}
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
            defaultValue={editInitial?.paymentStatus ?? PAYMENT_STATUSES[0]}
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

      <input type="hidden" name="items" value={itemsJson} readOnly />
      <input type="hidden" name="discountPct" value={discountPct} readOnly />

      {state.error ? (
        <p role="alert" className="text-caption text-danger">
          {t(state.error)}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || lines.length === 0}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 flex-1 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
        >
          {mode.kind === "edit"
            ? pending
              ? t("orders.edit.saving")
              : t("orders.edit.save")
            : pending
              ? t("orders.new.saving")
              : t("orders.new.save")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border px-4 font-medium transition-colors"
        >
          {t("orders.new.cancel")}
        </button>
      </div>
    </form>
  );
}
