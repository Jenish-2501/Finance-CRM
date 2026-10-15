import React from 'react';

interface PrintWatermarkProps {
  logoDataUrl?: string | null;
}

/**
 * Centred business-logo wordmark for browser-printed documents
 * (window.print -> Save as PDF). Sits absolutely behind the
 * `.print-container` content at 8% opacity; the jsPDF path in
 * `utils/pdfDocuments.ts` (drawWatermark) is the equivalent for
 * downloaded PDFs. Renders nothing when no logo is configured.
 */
export const PrintWatermark: React.FC<PrintWatermarkProps> = ({ logoDataUrl }) => {
  if (!logoDataUrl) return null;
  return (
    <div aria-hidden="true" className="pdf-watermark">
      <img src={logoDataUrl} alt="" draggable={false} />
    </div>
  );
};
