/**
 * GIB integration contract.
 *
 * This module intentionally contains no network calls and no GIB credentials.
 * It defines the boundary that a future authorized private integrator can implement.
 */

export type GibDocumentType = "E_FATURA" | "E_ARSIV";

export type GibDocumentStatus =
  | "DRAFT"
  | "QUEUED"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED"
  | "ERROR";

export interface GibInvoiceParty {
  taxNumber?: string;
  taxOffice?: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  email?: string;
}

export interface GibInvoiceLine {
  productCode?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  currency: string;
}

export interface GibInvoiceDocument {
  documentType: GibDocumentType;
  invoiceNumber: string;
  issueDate: string;
  currency: string;
  supplier: GibInvoiceParty;
  customer: GibInvoiceParty;
  lines: GibInvoiceLine[];
  notes?: string[];
}

export interface GibSendResult {
  status: GibDocumentStatus;
  provider?: string;
  documentUuid?: string;
  providerDocumentId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface GibStatusResult {
  status: GibDocumentStatus;
  documentUuid?: string;
  providerDocumentId?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** Future provider adapter. Keep ERP business logic independent of the provider. */
export interface GibProvider {
  readonly name: string;
  send(document: GibInvoiceDocument): Promise<GibSendResult>;
  getStatus(documentUuid: string): Promise<GibStatusResult>;
  cancel?(documentUuid: string, reason: string): Promise<GibStatusResult>;
}
