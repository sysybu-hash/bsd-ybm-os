import { v1 } from "@google-cloud/documentai";
import { env } from "@/lib/env";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getModelChainForScanMode, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";
export {
  getDocAiProcessorConfigs,
  isAnyDocAiProcessorConfigured,
  isDocAiProcessorConfigured,
  docAiProcessorFallbackOrder,
  type DocAiProcessorKind,
  type DocAiRawEntity,
  type DocAiFormField,
  type DocAiTable,
  type DocAiRawResult,
} from "@/lib/docai-processor-config";
import type { DocAiProcessorKind, DocAiRawEntity, DocAiRawResult } from "@/lib/docai-processor-config";
import {
  DOC_AI_PROCESSORS,
  resolveDocAiProcessorRaw,
  resolveDocAiProcessorResourceName,
  resolveDocAiLocation,
  discoverDocAiProcessorResourceName,
  simplifyDocAiProperties,
  simplifyDocAiFormFields,
  simplifyDocAiTables,
  docAiProcessorFallbackOrder,
  isDocAiProcessorConfigured,
} from "@/lib/docai-processor-config";

const { DocumentProcessorServiceClient } = v1;

type ServiceAccountCredentials = {
  project_id?: string;
};

export async function processDocumentAiRaw(
  base64: string,
  mimeType: string,
  processorKind: DocAiProcessorKind = "INVOICE",
): Promise<DocAiRawResult> {
  const credentialsJson =
    env.GOOGLE_DOCUMENT_AI_CREDENTIALS?.trim() ||
    env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();

  if (!credentialsJson) {
    throw new Error(
      "Missing GOOGLE_DOCUMENT_AI_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON",
    );
  }

  let credentials: ServiceAccountCredentials;
  try {
    credentials = JSON.parse(credentialsJson) as ServiceAccountCredentials;
  } catch {
    throw new Error(
      "Failed to parse Document AI credentials JSON (GOOGLE_DOCUMENT_AI_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON)",
    );
  }

  const dedicatedRaw = resolveDocAiProcessorRaw(processorKind);
  const legacyRaw = env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID?.trim() || "";
  const discoveryLocation = resolveDocAiLocation();
  const initialEndpoint = `${discoveryLocation}-documentai.googleapis.com`;

  let client = new DocumentProcessorServiceClient({
    credentials,
    apiEndpoint: initialEndpoint,
  });

  let processorId = dedicatedRaw ? resolveDocAiProcessorResourceName(dedicatedRaw, credentials) : "";
  if (!processorId) {
    try {
      processorId = (await discoverDocAiProcessorResourceName(client, credentials, processorKind)) ?? "";
    } catch (error) {
      if (!legacyRaw) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Document AI processor discovery failed: ${msg.slice(0, 300)}`);
      }
    }
  }
  if (!processorId && legacyRaw) {
    processorId = resolveDocAiProcessorResourceName(legacyRaw, credentials);
  }
  if (!processorId) {
    throw new Error(`Missing ${DOC_AI_PROCESSORS[processorKind].env} or discoverable ${DOC_AI_PROCESSORS[processorKind].label}`);
  }

  const locationMatch = processorId.match(/locations\/([^/]+)/);
  const apiEndpoint = locationMatch ? `${locationMatch[1]}-documentai.googleapis.com` : initialEndpoint;
  if (apiEndpoint !== initialEndpoint) {
    client = new DocumentProcessorServiceClient({ credentials, apiEndpoint });
  }

  const [result] = await client.processDocument({
    name: processorId,
    rawDocument: { content: base64, mimeType },
  });

  const doc = result.document;
  if (!doc) throw new Error("Document AI returned no document data");

  const fullText = doc.text || "";
  const entities: DocAiRawEntity[] =
    doc.entities?.map((e) => ({
      type: e.type,
      mentionText: e.mentionText,
      confidence: e.confidence ?? undefined,
      normalizedValue: e.normalizedValue?.text || e.mentionText || null,
      properties: simplifyDocAiProperties(e.properties as unknown),
    })) ?? [];

  return {
    fullText,
    entities,
    formFields: simplifyDocAiFormFields(doc.pages as unknown, fullText),
    tables: simplifyDocAiTables(doc.pages as unknown, fullText),
    processorKind,
    processorResourceName: processorId,
  };
}

export async function processDocumentAiRawForScanMode(
  base64: string,
  mimeType: string,
  scanMode: ScanModeV5,
): Promise<DocAiRawResult> {
  const errors: string[] = [];
  for (const kind of docAiProcessorFallbackOrder(scanMode)) {
    if (!isDocAiProcessorConfigured(kind)) continue;
    try {
      return await processDocumentAiRaw(base64, mimeType, kind);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${DOC_AI_PROCESSORS[kind].label}: ${msg.slice(0, 220)}`);
    }
  }
  throw new Error(
    errors.length
      ? `Document AI processors failed. ${errors.join(" | ")}`
      : "No configured Document AI processor. Configure OCR, Expense, Invoice, or Form processor ID.",
  );
}

/**
 * 🚀 BSD-YBM Active: PREMIUM GOOGLE DOCUMENT AI EXTRACTOR
 * Uses the dedicated Document AI service for ultra-high precision.
 * scanMode קובע: (1) סדר פרוססורים (INVOICE→EXPENSE→FORM→OCR לחשבוניות; FORM→OCR לגרמושקה),
 * ו-(2) מודל ה-Gemini לנורמליזציה (invoice chain / blueprint chain וכד').
 */
export async function extractDocumentWithDocAI(
  base64: string,
  mimeType: string,
  fileName: string,
  documentInstruction: string,
  scanMode: ScanModeV5 = "GENERAL_DOCUMENT",
): Promise<Record<string, unknown>> {
  const result = await processDocumentAiRawForScanMode(base64, mimeType, scanMode);
  return normalizeDocAiResultWithGemini(result, fileName, documentInstruction, scanMode);
}

export async function normalizeDocAiResultWithGemini(
  result: Pick<DocAiRawResult, "fullText" | "entities" | "formFields" | "tables" | "processorKind">,
  fileName: string,
  documentInstruction: string,
  /** סוג הסריקה — קובע איזה מודל Gemini ישמש לנורמליזציה */
  scanMode: ScanModeV5 = "GENERAL_DOCUMENT",
): Promise<Record<string, unknown>> {
  const { fullText, entities, formFields, tables, processorKind } = result;

  const aiSummary = `
DOCUMENT AI OCR TEXT:
${fullText}

EXTRACTED ENTITIES:
${JSON.stringify(entities, null, 2)}

FORM FIELDS:
${JSON.stringify(formFields, null, 2)}

TABLES:
${JSON.stringify(tables, null, 2)}
  `;

  // Secondary pass with Gemini for 100% schema compliance
  const geminiKey = env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
  if (!geminiKey) {
     // If no Gemini key, we try a basic manual mapping (not ideal for "Premium")
     throw new Error("Google Document AI requires Gemini for schema normalization in this version.");
  }

  const genAI = new GoogleGenerativeAI(geminiKey);

  const prompt = `
${documentInstruction}
File: ${fileName}

I have processed this document using Google Document AI. 
Processor: ${DOC_AI_PROCESSORS[processorKind].label}
Below is the raw text and extracted entities. 
Please convert this into the required JSON format.

${aiSummary}
  `;

  // בחירת מודל לפי סוג הסריקה — חשבונית ← invoice chain, גרמושקה ← blueprint chain וכד'
  const modelChain = getModelChainForScanMode(scanMode);
  let lastErr: unknown = null;
  for (const modelName of modelChain) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const geminiResult = await model.generateContent(prompt);
      const text = geminiResult.response.text();
      return parseModelJsonText(text);
    } catch (err: unknown) {
      lastErr = err;
      if (isLikelyGeminiModelUnavailable(err)) continue;
      const inner = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Document AI (OCR הושלם) — נכשל שלב נורמליזציה עם Gemini: ${inner}`,
      );
    }
  }
  const inner = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(
    `Document AI (OCR הושלם) — נכשל שלב נורמליזציה עם Gemini (כל המודלים): ${inner}`,
  );
}

