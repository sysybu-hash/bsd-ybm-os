import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Groq } from 'groq-sdk';

// אתחול המנועים - עצל (Lazy Initialization) כדי למנוע שגיאות בזמן build כשחסרים מפתחות
let genAI: GoogleGenerativeAI | null = null;
let openai: OpenAI | null = null;
let anthropic: Anthropic | null = null;
let groq: Groq | null = null;

function getGenAI() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || 'dummy-key');
  return genAI;
}

function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy-key' });
  return openai;
}

function getAnthropic() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key' });
  return anthropic;
}

function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy-key' });
  return groq;
}

export async function askAI(provider: 'gemini' | 'openai' | 'claude' | 'groq', prompt: string, imageBase64?: string) {
  switch (provider) {
    case 'gemini': {
      const model = getGenAI().getGenerativeModel({ model: process.env.CRM_ANALYSIS_GEMINI_MODEL || 'gemini-1.5-flash' });
      const result = await model.generateContent(
        imageBase64 ? [prompt, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] : [prompt],
      );
      return result.response.text();
    }

    case 'openai': {
      const oaiRes = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
      });
      return oaiRes.choices?.[0]?.message?.content ?? '';
    }

    case 'claude': {
      const claudeRes = await getAnthropic().messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      return (claudeRes?.content?.[0] as any)?.text ?? '';
    }

    case 'groq': {
      const groqRes = await getGroq().chat.completions.create({
        model: 'mixtral-8x7b-32768',
        messages: [{ role: 'user', content: prompt }],
      });
      return groqRes.choices?.[0]?.message?.content ?? '';
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
