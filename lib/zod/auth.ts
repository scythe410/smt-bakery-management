// Zod schemas for auth inputs. Every mutation input is validated server-side
// (CLAUDE.md §7.6); this is the single source of truth for the sign-in shape.

import { z } from "zod";

export const signInSchema = z
  .object({
    email: z.string().trim().min(1).email(),
    password: z.string().min(1),
  })
  .strict(); // reject unknown fields (CLAUDE.md §7.6)

export type SignInInput = z.infer<typeof signInSchema>;
