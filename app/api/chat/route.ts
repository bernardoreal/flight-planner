import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY is not set in environment variables.' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKey,
    });

    const completion = await openai.chat.completions.create({
      model: model || "gpt-os-120b",
      messages: messages,
    });

    return NextResponse.json(completion);
  } catch (error: any) {
    console.error('OpenRouter API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch response from OpenRouter' },
      { status: error.status || 500 }
    );
  }
}
