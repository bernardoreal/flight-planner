# Flight Planner App

This is a Next.js application designed to be deployed on Cloudflare Pages.

## Deployment Instructions

### 1. Cloudflare Pages Setup

When deploying to Cloudflare Pages, you must configure the build settings as follows:

- **Framework Preset:** Next.js
- **Build Command:** `npm run pages:build` (or `npx @cloudflare/next-on-pages`)
- **Build Output Directory:** `.vercel/output/static`

### 2. Environment Variables (Crucial!)

To use the AI features in production, you **MUST** add your OpenRouter API key to the Cloudflare Pages environment variables.

1.  Go to your Cloudflare Pages project dashboard.
2.  Navigate to **Settings** > **Environment variables**.
3.  Add a new variable:
    -   **Variable name:** `OPENROUTER_API_KEY`
    -   **Value:** Your OpenRouter API Key.

> **Note:** The variable name must be exactly `OPENROUTER_API_KEY`. It is used server-side for security.

### 3. Compatibility

This project is configured with `nodejs_compat` compatibility flag in `wrangler.toml` for optimal performance on Cloudflare Workers.
