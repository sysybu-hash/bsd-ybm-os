import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from "@/lib/env";
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Groq } from 'groq-sdk';
import { getGeminiModelId } from '@/lib/gemini-model';
import {
  getAnthropicModelCandidates,
  getGroqModel,
  getOpenAiChatTextModelCandidates,
} from '@/lib/ai-providers';

// אתחול המנועים - עצל (Lazy Initialization) כדי למנוע שגיאות בזמן build כשחסרים מפתחות
let genAI: GoogleGenerativeAI | null = null;
let openai: OpenAI | null = null;
let anthropic: Anthropic | null = null;
let groq: Groq | null = null;

function getGenAI() {
  if (!genAI) genAI = new GoogleGenerativeAI(env.GOOGLE_GENERATIVE_AI_API_KEY || 'dummy-key');
  return genAI;
}

function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: env.OPENAI_API_KEY || 'dummy-key' });
  return openai;
}

function getAnthropic() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY || 'dummy-key' });
  return anthropic;
}

function getGroq() {
  if (!groq) groq = new Groq({ apiKey: env.GROQ_API_KEY || 'dummy-key' });
  return groq;
}

export async function askAI(provider: 'gemini' | 'openai' | 'claude' | 'groq', prompt: string, imageBase64?: string) {
  switch (provider) {
    case 'gemini': {
      const model = getGenAI().getGenerativeModel({
        model: env.CRM_ANALYSIS_GEMINI_MODEL?.trim() || getGeminiModelId(),
      });
      const result = await model.generateContent(
        imageBase64 ? [prompt, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] : [prompt],
      );
      return result.response.text();
    }

    case 'openai': {
      const oaiRes = await getOpenAI().chat.completions.create({
        model: getOpenAiChatTextModelCandidates()[0] ?? 'gpt-5.5',
        messages: [{ role: 'user', content: prompt }],
      });
      return oaiRes.choices?.[0]?.message?.content ?? '';
    }

    case 'claude': {
      const claudeRes = await getAnthropic().messages.create({
        model: getAnthropicModelCandidates()[0] ?? 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = claudeRes?.content?.[0];
      return block && 'text' in block ? block.text : '';
    }

    case 'groq': {
      const groqRes = await getGroq().chat.completions.create({
        model: getGroqModel(),
        messages: [{ role: 'user', content: prompt }],
      });
      return groqRes.choices?.[0]?.message?.content ?? '';
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
