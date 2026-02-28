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
    season: z.number(),
    featuredImage: z.string().optional(),
    tags: z.array(z.string()).optional(),
    external: z
      .object({
        code: z.string().url().optional(),
      })
      .optional(),
  }),
});

const publications = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    authors: z.array(z.string()),
    author_notes: z.array(z.string()).optional(),
    date: z.date(),
    doi: z.string().optional(),
    publication_types: z.array(z.string()),
    publication: z.string(),
    publication_short: z.string(),
    abstract: z.string(),
    summary: z.string(),
    tags: z.array(z.string()).optional(),
    featured: z.boolean().optional(),
    url_pdf: z.string().optional(),
    url_code: z.string().optional(),
    url_dataset: z.string().optional(),
    url_slides: z.string().optional(),
    url_video: z.string().optional(),
    url_project: z.string().optional(),
    featuredImage: z.string().optional(),
  }),
});

const publicationsEl = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    authors: z.array(z.string()),
    author_notes: z.array(z.string()).optional(),
    date: z.date(),
    doi: z.string().optional(),
    publication_types: z.array(z.string()),
    publication: z.string(),
    publication_short: z.string(),
    abstract: z.string(),
    summary: z.string(),
    tags: z.array(z.string()).optional(),
    featured: z.boolean().optional(),
    url_pdf: z.string().optional(),
    url_code: z.string().optional(),
    url_dataset: z.string().optional(),
    url_slides: z.string().optional(),
    url_video: z.string().optional(),
    url_project: z.string().optional(),
    featuredImage: z.string().optional(),
  }),
});

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.date(),
    tags: z.array(z.string()).optional(),
    featuredImage: z.string().optional(),
    url_code: z.string().optional(),
    url_pdf: z.string().optional(),
    url_slides: z.string().optional(),
    url_video: z.string().optional(),
  }),
});

const projectsEl = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.date(),
    tags: z.array(z.string()).optional(),
    featuredImage: z.string().optional(),
    url_code: z.string().optional(),
    url_pdf: z.string().optional(),
    url_slides: z.string().optional(),
    url_video: z.string().optional(),
  }),
});

export const collections = {
  formula,
  formulaEl,
  publications,
  publicationsEl,
  projects,
  projectsEl,
};