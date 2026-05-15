import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "לא נמצא קובץ" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF
    const data = await pdfParse(buffer);

    return NextResponse.json({ text: data.text });
  } catch (error) {
    console.error("Error extracting PDF:", error);
    return NextResponse.json({ error: "שגיאה בחילוץ טקסט מהקובץ" }, { status: 500 });
  }
}
