import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readBase64FromDotenv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const m = raw.match(/FIREBASE_SERVICE_ACCOUNT_BASE64=\"([\s\S]*?)\"/);
    if (!m) return null;
    return m[1].replace(/\r?\n/g, "");
  } catch {
    return null;
  }
}

function parseServiceAccount() {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || readBase64FromDotenv();
  if (!base64) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 חסר");
  }
  const json = Buffer.from(base64, "base64").toString("utf8");
  try {
    return JSON.parse(json);
  } catch {
    // יש קבצים שבהם private_key הגיע עם escape-ים לא חוקיים (למשל \m במקום \n)
    const sanitized = json.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    return JSON.parse(sanitized);
  }
}

async function main() {
  const serviceAccount = parseServiceAccount();
  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || serviceAccount.project_id,
    });
  }

  const db = getFirestore();
  const collections = await db.listCollections();
  const names = collections.map((c) => c.id);

  console.log(`נמצאו ${collections.length} אוספים למחיקה: ${names.join(", ") || "ללא נתונים"}`);

  for (const col of collections) {
    console.log(`מוחק אוסף: ${col.id}`);
    await db.recursiveDelete(col);
  }

  console.log("Firebase Firestore נוקה בהצלחה (גרסה נקייה).");
}

main().catch((err) => {
  console.error("ניקוי Firebase נכשל:", err);
  process.exit(1);
});
