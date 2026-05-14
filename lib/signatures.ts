import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from 'uuid';

/**
 * Creates a unique signature request for a document.
 */
export async function createSignatureRequest(params: {
  organizationId: string;
  documentId?: string;
  recipientEmail: string;
  recipientName: string;
  metadata?: any;
}) {
  const token = uuidv4();
  
  // We can use the Quote model or create a new SignatureRequest model.
  // For simplicity, we'll use Quote for now if it fits, or assume a general signature table.
  // The user's schema has Quote with token and signatureBase64.
  
  return await prisma.quote.create({
    data: {
      token,
      amount: 0, // Placeholder
      organizationId: params.organizationId,
      contactId: await findOrCreateContact(params.recipientName, params.recipientEmail, params.organizationId),
      status: "PENDING_SIGNATURE",
    }
  });
}

async function findOrCreateContact(name: string, email: string, organizationId: string) {
  const existing = await prisma.contact.findFirst({
    where: { email, organizationId }
  });
  
  if (existing) return existing.id;
  
  const created = await prisma.contact.create({
    data: { name, email, organizationId, status: "LEAD" }
  });
  
  return created.id;
}
