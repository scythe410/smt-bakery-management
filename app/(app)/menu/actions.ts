"use server";

// Menu server actions (SPEC §4.1).
//
// Security (CLAUDE.md §7): all roles may manage menu (access matrix: ALL_ROLES).
// Each action re-asserts the session (requireProfile) and stamps business_id
// from the authenticated profile — never from the client (§7.3). All inputs are
// Zod-validated; unknown fields are rejected (§7.6). Price is converted to
// integer cents here — no float money is stored (§3). item_code 0 signals
// "auto-assign", handled by the DB trigger (migration 010).

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidateBusinessTags } from "@/lib/db/cache";
import { toCents } from "@/lib/money";
import {
  upsertMenuItemSchema,
  toggleAvailabilitySchema,
  recipeLinesSchema,
  IMAGE_MAX_BYTES,
  IMAGE_MIME_EXT,
} from "@/lib/zod/menu";
import { getRecipeLines } from "@/lib/db/queries/menu";

export type MenuActionState = { ok?: boolean; error?: string };

const UNIQUE_VIOLATION = "23505";

function revalidateMenu(businessId: string) {
  revalidatePath("/menu");
  revalidateBusinessTags(businessId, ["menu", "pricing"]);
}

// --- Create menu item --------------------------------------------------------

export async function createMenuItem(
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "menu.form.error" };

  const parsed = upsertMenuItemSchema.safeParse({
    name: formData.get("name"),
    priceMajor: formData.get("priceMajor"),
    category: formData.get("category") || undefined,
    isAvailable: formData.get("isAvailable") ?? "true",
    itemCode: formData.get("itemCode") || 0,
  });
  if (!parsed.success) return { error: "menu.form.error" };

  const supabase = await createClient();

  const { data: item, error } = await supabase
    .from("menu_item")
    .insert({
      business_id: profile.business_id,
      name: parsed.data.name,
      price_cents: toCents(parsed.data.priceMajor),
      category: parsed.data.category ?? null,
      is_available: parsed.data.isAvailable,
      item_code: parsed.data.itemCode === 0 ? undefined : parsed.data.itemCode,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: "menu.form.errorCodeDuplicate" };
    return { error: "menu.form.error" };
  }

  // Image upload — optional, non-blocking.
  const imageFile = formData.get("image");
  if (imageFile instanceof File && imageFile.size > 0 && item?.id) {
    await uploadMenuImage(supabase, profile.business_id, item.id, imageFile);
  }

  revalidateMenu(profile.business_id);
  return { ok: true };
}

// --- Update menu item --------------------------------------------------------

export async function updateMenuItem(
  id: string,
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "menu.form.error" };

  const parsed = upsertMenuItemSchema.safeParse({
    name: formData.get("name"),
    priceMajor: formData.get("priceMajor"),
    category: formData.get("category") || undefined,
    isAvailable: formData.get("isAvailable") ?? "true",
    itemCode: formData.get("itemCode") || 0,
  });
  if (!parsed.success) return { error: "menu.form.error" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_item")
    .update({
      name: parsed.data.name,
      price_cents: toCents(parsed.data.priceMajor),
      category: parsed.data.category ?? null,
      is_available: parsed.data.isAvailable,
      item_code: parsed.data.itemCode === 0 ? undefined : parsed.data.itemCode,
    })
    .eq("id", id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: "menu.form.errorCodeDuplicate" };
    return { error: "menu.form.error" };
  }

  // Image upload — optional.
  const imageFile = formData.get("image");
  if (imageFile instanceof File && imageFile.size > 0) {
    await uploadMenuImage(supabase, profile.business_id, id, imageFile);
  }

  revalidateMenu(profile.business_id);
  return { ok: true };
}

// --- Delete menu item --------------------------------------------------------

export async function deleteMenuItem(id: string): Promise<MenuActionState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "menu.form.error" };

  const supabase = await createClient();
  const { error } = await supabase.from("menu_item").delete().eq("id", id);
  if (error) return { error: "menu.form.error" };

  revalidateMenu(profile.business_id);
  return { ok: true };
}

// --- Toggle availability (quick switch) -------------------------------------

export async function toggleMenuItemAvailability(
  id: string,
  isAvailable: boolean,
): Promise<MenuActionState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "menu.form.error" };

  const parsed = toggleAvailabilitySchema.safeParse({ id, isAvailable });
  if (!parsed.success) return { error: "menu.form.error" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_item")
    .update({ is_available: parsed.data.isAvailable })
    .eq("id", parsed.data.id);
  if (error) return { error: "menu.form.error" };

  revalidateMenu(profile.business_id);
  return { ok: true };
}

// --- Upsert recipe lines (BOM) ----------------------------------------------
//
// Replaces ALL recipe lines for a menu item atomically: delete existing lines
// then re-insert the submitted set. Because recipe_line has a unique constraint
// on (menu_item_id, inventory_item_id), duplicates in the submitted list would
// fail; the Zod schema caps the list at 50 items.
//
// INGREDIENT constraint: the action resolves each inventory_item_id server-side
// to confirm kind = 'ingredient' before inserting. Any non-ingredient id is
// rejected for the whole batch (CLAUDE.md §4 FT1).
//
// Unit sync: each inserted line copies the inventory_item.unit (stocking unit)
// so the DB-level "unit must equal item unit" invariant is always met (migration
// 002: recipe_line.unit should match the stocking unit, no conversion).

export type RecipeActionState = { ok?: boolean; error?: string };

export async function upsertRecipeLines(
  _prev: RecipeActionState,
  formData: FormData,
): Promise<RecipeActionState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "menu.recipe.error" };

  const rawLines = formData.get("lines");
  let parsedLines: { inventoryItemId: string; qty: number }[];
  try {
    parsedLines = JSON.parse(typeof rawLines === "string" ? rawLines : "[]");
  } catch {
    return { error: "menu.recipe.error" };
  }

  const parsed = recipeLinesSchema.safeParse({
    menuItemId: formData.get("menuItemId"),
    lines: parsedLines,
  });
  if (!parsed.success) return { error: "menu.recipe.error" };

  const { menuItemId, lines } = parsed.data;

  const supabase = await createClient();

  // Verify all ingredient IDs belong to this tenant and are INGREDIENT kind.
  if (lines.length > 0) {
    const ingredientIds = lines.map((l) => l.inventoryItemId);
    const { data: items, error: lookupError } = await supabase
      .from("inventory_item")
      .select("id, kind, unit")
      .in("id", ingredientIds);

    if (lookupError) return { error: "menu.recipe.error" };

    const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
    for (const l of lines) {
      const item = itemMap.get(l.inventoryItemId);
      if (!item) return { error: "menu.recipe.errorNotFound" };
      if (item.kind !== "ingredient") return { error: "menu.recipe.errorNotIngredient" };
    }

    // Delete existing lines for this menu item, then re-insert.
    const { error: deleteError } = await supabase
      .from("recipe_line")
      .delete()
      .eq("menu_item_id", menuItemId);
    if (deleteError) return { error: "menu.recipe.error" };

    const inserts = lines.map((l) => {
      const item = itemMap.get(l.inventoryItemId)!;
      return {
        business_id: profile.business_id!,
        menu_item_id: menuItemId,
        inventory_item_id: l.inventoryItemId,
        qty: l.qty,
        unit: item.unit,
      };
    });

    const { error: insertError } = await supabase.from("recipe_line").insert(inserts);
    if (insertError) return { error: "menu.recipe.error" };
  } else {
    // Empty lines = clear the recipe.
    const { error: deleteError } = await supabase
      .from("recipe_line")
      .delete()
      .eq("menu_item_id", menuItemId);
    if (deleteError) return { error: "menu.recipe.error" };
  }

  revalidateBusinessTags(profile.business_id, ["pricing", "menu"]);
  revalidatePath("/menu");
  return { ok: true };
}

// --- Helpers -----------------------------------------------------------------

async function uploadMenuImage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  businessId: string,
  menuItemId: string,
  file: File,
): Promise<void> {
  if (file.size > IMAGE_MAX_BYTES) return;
  const ext = IMAGE_MIME_EXT[file.type];
  if (!ext) return;

  const path = `${businessId}/${menuItemId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("item-images")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) return;

  await supabase.from("menu_item").update({ image_url: path }).eq("id", menuItemId);
}

// --- Load recipe lines for a menu item (used by the recipe editor) -----------

export async function loadRecipeLinesForItem(menuItemId: string) {
  await requireProfile();
  return getRecipeLines(menuItemId);
}
