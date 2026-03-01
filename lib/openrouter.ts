import OpenAI from 'openai';

const openRouterApiKey = process.env.OPENROUTER_API_KEY || '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';

if (!process.env.OPENROUTER_API_KEY) {
  console.warn('Using hardcoded OPENROUTER_API_KEY. Please set this in your environment variables for production.');
}

export const openRouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: openRouterApiKey,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000', // Optional, for including your app on openrouter.ai rankings.
    'X-Title': 'LATAM Cargo Global Operations Master', // Optional. Shows in rankings on openrouter.ai.
  },
  dangerouslyAllowBrowser: true,
});
