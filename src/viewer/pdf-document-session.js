let resolvePdfDocumentSession;

export const pdfDocumentSessionReady = new Promise((resolve) => {
  resolvePdfDocumentSession = resolve;
});

export function publishPdfDocument(pdfDocument) {
  resolvePdfDocumentSession({
    document: pdfDocument,
    fingerprint: pdfDocument.fingerprints?.[0] || null,
  });
}

export function abandonPdfDocumentSession() {
  resolvePdfDocumentSession(null);
}
