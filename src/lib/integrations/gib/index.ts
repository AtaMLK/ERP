/**
 * GIB integration boundary.
 *
 * IMPORTANT: This adapter is deliberately disabled. It contains no HTTP client,
 * credentials, endpoint or send operation. A real provider can be implemented
 * behind this contract after the business decision to enable GIB.
 */
export type GibDocumentType = 'e_fatura' | 'e_arsiv';

export type GibDocument = {
  type: GibDocumentType;
  xml: string;
};

export type GibResult = {
  accepted: boolean;
  providerDocumentId?: string;
  status?: string;
};

export interface GibProvider {
  buildUBLTR(input: Record<string, unknown>): Promise<GibDocument>;
  send(_document: GibDocument): Promise<GibResult>;
  getStatus(_providerDocumentId: string): Promise<GibResult>;
}

/** No-op provider: explicitly refuses all transmission. */
export class DisabledGibProvider implements GibProvider {
  async buildUBLTR(input: Record<string, unknown>): Promise<GibDocument> {
    return { type: (input.type as GibDocumentType) || 'e_arsiv', xml: '' };
  }

  async send(_document: GibDocument): Promise<GibResult> {
    throw new Error('GIB integration is disabled');
  }

  async getStatus(_providerDocumentId: string): Promise<GibResult> {
    throw new Error('GIB integration is disabled');
  }
}

export const gibProvider: GibProvider = new DisabledGibProvider();
