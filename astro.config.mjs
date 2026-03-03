// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  base: '/mpalaourg-astro',
  output: 'server',
  integrations: [mdx()],

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: cloudflare(),
});