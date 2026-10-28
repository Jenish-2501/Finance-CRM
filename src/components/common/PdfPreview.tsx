import React, { useEffect, useMemo } from 'react';
import type jsPDF from 'jspdf';

interface PdfPreviewProps {
  /** The exact jsPDF document that downloads and prints — preview IS the PDF. */
  doc: jsPDF | null;
  className?: string;
  ariaLabel?: string;
}

/**
 * Renders a jsPDF document through Chromium's built-in PDF viewer.
 *
 * Single source of truth: the preview embeds the same jsPDF output that the
 * Download button saves and the printer receives, so the on-screen preview,
 * the printed page and the saved file can never drift apart (the old HTML
 * replica could).
 */
export const PdfPreview: React.FC<PdfPreviewProps> = ({ doc, className, ariaLabel }) => {
  // bloburl is the supported jsPDF output type for viewer embedding.
  const url = useMemo(() => {
    if (!doc) return null;
    try {
      const u = doc.output('bloburl');
      return u ? String(u) : null;
    } catch {
      // Some jsPDF/runtime combos cannot create object URLs (e.g. jsdom
      // without createObjectURL) — degrade to an empty frame, never throw.
      return null;
    }
  }, [doc]);

  useEffect(() => {
    return () => {
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // revocation failure must not break the app
        }
      }
    };
  }, [url]);

  if (!url) return null;

  return (
    <iframe
      title={ariaLabel || 'Document preview'}
      src={url}
      className={className || 'w-full h-[75vh] bg-white rounded-lg border border-input shadow-sm'}
    />
  );
};
