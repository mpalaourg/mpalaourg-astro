import { defineCollection, z } from "astro:content";

const formula = defineCollection({
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.date(),
    tags: z.array(z.string()).optional(),
    featuredImage: z.string().optional(),
    external: z
      .object({
        code: z.string().url().optional(),
      })
      .optional(),
  }),
});

export const collections = { formula };