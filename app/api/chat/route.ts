import { NextResponse } from 'next/server';
import { askAI } from '@/lib/ai-orchestrator';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { provider, prompt } = await request.json();

    if (!provider || !prompt) {
      return NextResponse.json({ error: 'חסרים פרמטרים' }, { status: 400 });
    }

    const reply = await askAI(provider, prompt);

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error('Chat API Error:', err);
    return NextResponse.json({ error: 'שגיאה בתקשורת עם מנוע ה-AI' }, { status: 500 });
  }
}
