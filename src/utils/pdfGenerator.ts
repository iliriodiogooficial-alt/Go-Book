import { jsPDF } from "jspdf";

export function generateStudyPDF(title: string, summary: string, markdown: string) {
  // Initialize standard letter format jsPDF
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);

  let y = 25; // Vertical cursor

  // Helper function to check space and add page if needed
  const checkPageSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin) {
      drawFooter();
      doc.addPage();
      drawHeaderPattern();
      y = 30; // Reset height after header
    }
  };

  // Draw header accent band
  const drawHeaderPattern = () => {
    doc.setFillColor(37, 99, 235); // Tailwind Blue 600
    doc.rect(0, 0, pageWidth, 12, "F");
    
    doc.setFillColor(30, 41, 59); // Slate 800 decoration line
    doc.rect(0, 12, pageWidth, 1, "F");

    // Add Go book stamp in upper corner
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("GO BOOK - GUIA INTELIGENTE DE ESTUDOS", margin, 8);
  };

  // Draw Footer
  const drawFooter = () => {
    const totalPages = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : 1;
    doc.setFont("Helvetica", "oblique");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // Slate 400
    doc.text("Gerado por Go book • Estude de forma inteligente", margin, pageHeight - 10);
    doc.text(`Página ${totalPages}`, pageWidth - margin - 15, pageHeight - 10);
  };

  // Draw initial page header decor
  drawHeaderPattern();

  // Document Title
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 41, 59); // Slate 800
  
  const splitTitle = doc.splitTextToSize(title.toUpperCase(), contentWidth);
  checkPageSpace(splitTitle.length * 8 + 5);
  doc.text(splitTitle, margin, y);
  y += splitTitle.length * 8 + 6;

  // Horizontal divider
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Summary box
  if (summary) {
    const summaryHeaderHeight = 6;
    checkPageSpace(summaryHeaderHeight + 15);
    
    doc.setFillColor(248, 250, 252); // Cool slate background
    doc.setDrawColor(226, 232, 240);
    
    const parsedSummary = doc.splitTextToSize(`Resumo: ${summary}`, contentWidth - 10);
    const boxHeight = parsedSummary.length * 6 + 10;
    
    checkPageSpace(boxHeight);
    doc.rect(margin, y, contentWidth, boxHeight, "FD");
    
    doc.setFont("Helvetica", "oblique");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105); // Slate 600
    doc.text(parsedSummary, margin + 5, y + 7);
    y += boxHeight + 10;
  }

  // Parse markdown lines simplistically and render
  const lines = markdown.split("\n");
  
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(51, 65, 85); // Slate 700

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      y += 4; // Spacing for empty lines
      continue;
    }

    if (line.startsWith("# ")) {
      // Main header
      const text = line.replace("# ", "").trim();
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42); // Slate 900
      
      const splitHeader = doc.splitTextToSize(text, contentWidth);
      const needed = splitHeader.length * 7 + 6;
      checkPageSpace(needed);
      doc.text(splitHeader, margin, y + 4);
      y += needed;
    } 
    else if (line.startsWith("## ")) {
      // Sub header
      const text = line.replace("## ", "").trim();
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(37, 99, 235); // Blue 600
      
      const splitHeader = doc.splitTextToSize(text, contentWidth);
      const needed = splitHeader.length * 6 + 5;
      checkPageSpace(needed);
      doc.text(splitHeader, margin, y + 3);
      y += needed;
    } 
    else if (line.startsWith("### ")) {
      // Secondary header
      const text = line.replace("### ", "").trim();
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      
      const splitHeader = doc.splitTextToSize(text, contentWidth);
      const needed = splitHeader.length * 5 + 4;
      checkPageSpace(needed);
      doc.text(splitHeader, margin, y + 2);
      y += needed;
    } 
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      // Bullet list item
      const text = line.substring(2).trim();
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      
      // Draw solid bullet dot
      const splitBullet = doc.splitTextToSize(text, contentWidth - 6);
      const needed = splitBullet.length * 5 + 2;
      checkPageSpace(needed);
      
      doc.setFillColor(37, 99, 235);
      doc.circle(margin + 2, y + 1.5, 0.8, "F");
      doc.text(splitBullet, margin + 6, y + 3);
      y += needed;
    } 
    else {
      // Paragraph text
      // Strip markdown-bold markers `**` for printing
      const text = line.replace(/\*\*/g, "");
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      
      const splitBody = doc.splitTextToSize(text, contentWidth);
      const needed = splitBody.length * 5 + 3;
      checkPageSpace(needed);
      doc.text(splitBody, margin, y + 2);
      y += needed;
    }
  }

  // Draw final page numbers
  drawFooter();

  // Save the PDF
  const fileNameClean = title.toLowerCase().replace(/[^a-z0-9]/g, "_") || "guia_de_estudos";
  doc.save(`gobook_${fileNameClean}.pdf`);
}
