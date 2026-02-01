import { defineCollection, z } from "astro:content";

const formula = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.date(),
    featuredImage: z.string().optional(),
    tags: z.array(z.string()).optional(),
    external: z
      .object({
        code: z.string().url().optional(),
      })
      .optional(),
  }),
});

const formulaEl = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.date(),
    featuredImage: z.string().optional(),
    tags: z.array(z.string()).optional(),
    external: z
      .object({
        code: z.string().url().optional(),
      })
      .optional(),
  }),
});

export const collections = {
  formula,
  formulaEl,
};