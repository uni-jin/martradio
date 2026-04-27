export type LegalDocumentType = "privacy_policy" | "terms_of_service";

export type LegalDocumentVersion = {
  id: string;
  version: string;
  effectiveDate: string;
  updatedAt: string;
  content: string;
  changeSummary: string | null;
  isCurrent: boolean;
};

export type LegalDocumentsStore = Record<LegalDocumentType, LegalDocumentVersion[]>;

export const LEGAL_DOCUMENT_LABEL: Record<LegalDocumentType, string> = {
  privacy_policy: "개인정보처리방침",
  terms_of_service: "이용약관",
};

export function isLegalDocumentType(v: unknown): v is LegalDocumentType {
  return v === "privacy_policy" || v === "terms_of_service";
}

export function legalDocPathFromType(type: LegalDocumentType): string {
  return type === "privacy_policy"
    ? "/legal/privacy"
    : "/legal/terms";
}
