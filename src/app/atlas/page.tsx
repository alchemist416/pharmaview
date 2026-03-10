'use client';

import { useCallback, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import DisruptionAtlas from '@/components/atlas/DisruptionAtlas';

export default function AtlasPage() {
  const [exporting, setExporting] = useState(false);

  const exportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const container = document.getElementById('atlas-svg-container');
      if (!container) return;

      const svgEl = container.querySelector('svg');
      if (!svgEl) return;

      // Serialize SVG to a standalone string with inline styles
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      // Add background rect
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', clone.getAttribute('width') || '1200');
      bgRect.setAttribute('height', clone.getAttribute('height') || '800');
      bgRect.setAttribute('fill', '#0a0e1a');
      clone.insertBefore(bgRect, clone.firstChild);

      const svgString = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = async () => {
        // Render at 2x for high-res PDF
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);

        URL.revokeObjectURL(url);

        // Dynamic import for jsPDF (avoid SSR issues)
        const { default: jsPDF } = await import('jspdf');

        // Landscape PDF, sized to content
        const pdfWidth = img.width * 0.75; // pt
        const pdfHeight = img.height * 0.75;
        const pdf = new jsPDF({
          orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
          unit: 'pt',
          format: [pdfWidth, pdfHeight],
        });

        const imgData = canvas.toDataURL('image/png', 1.0);
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('PharmaView-Disruption-Atlas.pdf');

        setExporting(false);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        setExporting(false);
        console.error('Failed to render SVG to image');
      };

      img.src = url;
    } catch (e) {
      console.error('PDF export failed', e);
      setExporting(false);
    }
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-bold text-primary tracking-wider">DISRUPTION ATLAS</h1>
          <p className="text-xs text-muted font-mono mt-1">
            30-year pharmaceutical supply chain intelligence timeline
          </p>
        </div>
        <button
          onClick={exportPDF}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 bg-accent-green/10 border border-accent-green/30 rounded text-accent-green text-xs font-mono hover:bg-accent-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              EXPORTING...
            </>
          ) : (
            <>
              <Download size={14} />
              EXPORT PDF
            </>
          )}
        </button>
      </div>

      {/* Atlas visualization */}
      <div className="border border-terminal-border rounded-lg bg-terminal-panel p-2 overflow-hidden">
        <DisruptionAtlas />
      </div>

      {/* Legend / info footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] font-mono text-muted">
        <div className="border border-terminal-border rounded p-3 bg-terminal-panel">
          <span className="text-accent-green font-semibold">DATA SOURCES</span>
          <p className="mt-1">FDA Drug Shortages Database · FDA Recall Enterprise System · openFDA API · FRED Economic Data · UN Comtrade</p>
        </div>
        <div className="border border-terminal-border rounded p-3 bg-terminal-panel">
          <span className="text-accent-green font-semibold">METHODOLOGY</span>
          <p className="mt-1">Shortage counts reflect new shortages reported per calendar year. Manufacturing geography estimates based on FDA establishment registrations and industry reports.</p>
        </div>
        <div className="border border-terminal-border rounded p-3 bg-terminal-panel">
          <span className="text-accent-green font-semibold">NOTES</span>
          <p className="mt-1">Hover over any data point for details. Geopolitical events are color-coded by type. Recession bands from NBER. PDF export renders at 2x resolution for print quality.</p>
        </div>
      </div>
    </div>
  );
}
