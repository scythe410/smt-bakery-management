// Zod schemas for menu mutations. Validated server-side (CLAUDE.md §7.6).
// business_id is NEVER taken from the client — the action stamps it from the
// authenticated session. Price arrives in major units (rupees) and is converted
// to integer cents server-side (CLAUDE.md §3). item_code defaults to 0 → the
// DB trigger auto-assigns the next sequential code for the business.

import { z } from "zod";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB (storage bucket limit)
export const IMAGE_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const upsertMenuItemSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // Price entered in rupees → converted to cents in the action.
    priceMajor: z.coerce.number().min(0).finite().max(100_000_000),
    category: z.string().trim().max(60).optional(),
    isAvailable: z
      .string()
      .optional()
      .transform((v) => v === "true" || v === "on" || v === "1"),
    // 0 = auto-assign via DB trigger; otherwise must be a positive integer.
    itemCode: z.coerce.number().int().min(0).max(9999).optional().default(0),
  })
  .strict();

export type UpsertMenuItemInput = z.infer<typeof upsertMenuItemSchema>;

export const toggleAvailabilitySchema = z
  .object({
    id: z.string().uuid(),
    isAvailable: z.boolean(),
  })
  .strict();

// A single recipe line submitted by the editor.
export const recipeLinesSchema = z.object({
  menuItemId: z.string().uuid(),
  lines: z
    .array(
      z
        .object({
          inventoryItemId: z.string().uuid(),
          qty: z.coerce.number().positive().finite().max(1_000_000),
        })
        .strict(),
    )
    .max(50),
});

export type RecipeLinesInput = z.infer<typeof recipeLinesSchema>;
