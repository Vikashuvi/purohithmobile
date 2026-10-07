import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function downloadInvoicePdf(invoiceHtml, invoiceNumber, preview) {
  const safeName = String(invoiceNumber || "invoice").replace(/[^\w.-]+/g, "-");
  if (preview && !preview.closed) {
    preview.document.open();
    preview.document.write("<!doctype html><title>Preparing invoice</title><p style=\"font-family:sans-serif;padding:24px\">Preparing your invoice PDF…</p>");
    preview.document.close();
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:0;top:0;width:794px;height:1400px;border:0;transform:translateX(-120vw);";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(invoiceHtml);
    doc.close();
    await new Promise((resolve) => {
      if (doc.readyState === "complete") resolve();
      else iframe.addEventListener("load", () => resolve(), { once: true });
    });
    await Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    }))));

    const page = doc.querySelector(".page") || doc.body;
    const canvas = await html2canvas(page, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      windowWidth: 794,
    });
    if (!canvas.width || !canvas.height) throw new Error("Could not draw the invoice.");

    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    const image = canvas.toDataURL("image/jpeg", 0.95);
    let offset = 0;
    pdf.addImage(image, "JPEG", 0, offset, pageWidth, imgHeight);
    let remaining = imgHeight - pageHeight;
    while (remaining > 1) {
      offset -= pageHeight;
      pdf.addPage();
      pdf.addImage(image, "JPEG", 0, offset, pageWidth, imgHeight);
      remaining -= pageHeight;
    }

    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    if (preview && !preview.closed) preview.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } finally {
    iframe.remove();
  }
}
