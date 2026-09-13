/**
 * GIB/UBL-TR mapping types and helpers only.
 * No HTTP/network/provider call is made here.
 * The XML serializer/provider can be added later after the integrator is selected.
 */

import type { GibInvoiceDocument } from "./types";

export type UblInvoiceProfile = "EARSIVFATURA" | "TEMELFATURA" | "TICARIFATURA";
export type UblInvoiceTypeCode = "SATIS" | "IADE" | "ISTISNA" | "TEVKIFAT" | "OZELMATRAH";

export interface UblTrTaxSubtotal {
  taxableAmount: number;
  taxAmount: number;
  percent: number;
  taxCategoryCode?: string;
  exemptionReasonCode?: string;
  exemptionReason?: string;
}

export interface UblTrInvoiceOptions {
  profileId: UblInvoiceProfile;
  invoiceTypeCode: UblInvoiceTypeCode;
  uuid?: string;
  issueTime?: string;
  dueDate?: string;
  orderReference?: string;
  despatchReference?: string;
  taxSubtotals?: UblTrTaxSubtotal[];
  withholdingTaxAmount?: number;
  allowanceTotalAmount?: number;
  chargeTotalAmount?: number;
  notes?: string[];
}

/**
 * Pure mapping boundary. It deliberately returns structured data rather than XML.
 * This keeps the current ERP free of GIB transport and signing logic.
 */
export function toUblTrDraft(
  document: GibInvoiceDocument,
  options: UblTrInvoiceOptions,
) {
  return {
    customizationId: "TR1.2",
    profileId: options.profileId,
    invoiceTypeCode: options.invoiceTypeCode,
    uuid: options.uuid,
    id: document.invoiceNumber,
    issueDate: document.issueDate,
    issueTime: options.issueTime,
    dueDate: options.dueDate,
    documentCurrencyCode: document.currency,
    orderReference: options.orderReference,
    despatchReference: options.despatchReference,
    supplier: document.supplier,
    customer: document.customer,
    lines: document.lines,
    taxSubtotals: options.taxSubtotals ?? [],
    withholdingTaxAmount: options.withholdingTaxAmount,
    allowanceTotalAmount: options.allowanceTotalAmount,
    chargeTotalAmount: options.chargeTotalAmount,
    notes: options.notes ?? document.notes ?? [],
  };
}
