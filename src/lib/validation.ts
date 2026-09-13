import { z } from 'zod';

export const idSchema = z.coerce.number().int().positive();
export const moneySchema = z.coerce.number().finite().nonnegative();
export const positiveMoneySchema = z.coerce.number().finite().positive();
export const currencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

export const orderCreateSchema = z.object({
  customerId: idSchema,
  items: z.array(z.object({
    productId: idSchema,
    quantity: z.coerce.number().finite().positive(),
    unitSalePrice: moneySchema.optional(),
    unitPurchasePrice: moneySchema.optional(),
    options: z.record(z.unknown()).optional(),
  })).min(1).max(500),
  currency: currencySchema.optional(),
  customerOrderNumber: z.string().trim().max(100).optional().nullable(),
  customerOrderDate: z.string().max(40).optional().nullable(),
  requestedDeliveryDate: z.string().max(40).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const paymentCreateSchema = z.object({
  invoiceId: idSchema,
  amount: positiveMoneySchema,
  paymentDate: z.string().max(40).optional(),
  paymentMethod: z.string().trim().max(50).optional().nullable(),
  currency: currencySchema.optional(),
  exchangeRateToEur: moneySchema.optional().nullable(),
  referenceNumber: z.string().trim().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export function validationMessage(error: z.ZodError) {
  return error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}
