// GST tax invoice shared by payment-workflow and cashfree-webhook.
// Line amounts are GST-inclusive (that is what the customer pays); taxable value and
// CGST/SGST are backed out per line so the printed totals always equal the amount paid.
// Seller details come from INVOICE_* secrets; empty values are omitted from the document.
import { INVOICE_LOGO_DATA_URI } from "./invoice-logo.ts";

export type InvoiceLineItem = {
  description: string;
  detail?: string;
  sac?: string;
  quantity?: number;
  unit?: string;
  amountInr: number;
};

export type InvoiceInput = {
  invoiceNumber: string;
  issuedAt?: string | Date;
  bookingId?: string | null;
  customer: { name?: string; address?: string; phone?: string; email?: string; gstin?: string };
  service: { ceremony?: string; date?: string; time?: string; venue?: string };
  payment: { mode: string; status: "paid" | "under_review"; reference?: string; paidAt?: string | Date | null };
  items: InvoiceLineItem[];
  gstPercent?: number;
};

const DEFAULT_SAC = "999799";

function seller() {
  const env = (key: string, fallback = "") => (Deno.env.get(key) || fallback).trim();
  return {
    brand: env("INVOICE_BRAND_NAME", "PurohithConnect™"),
    legalName: env("INVOICE_LEGAL_NAME", "Purohith Connect"),
    address: env("INVOICE_ADDRESS"),
    state: env("INVOICE_STATE", "Karnataka"),
    stateCode: env("INVOICE_STATE_CODE", "29"),
    gstin: env("INVOICE_GSTIN"),
    pan: env("INVOICE_PAN"),
    phone: env("INVOICE_PHONE"),
    email: env("INVOICE_EMAIL"),
    website: env("INVOICE_WEBSITE", "purohithconnect.com"),
    bankName: env("INVOICE_BANK_NAME"),
    bankAccountName: env("INVOICE_BANK_ACCOUNT_NAME"),
    bankAccountNumber: env("INVOICE_BANK_ACCOUNT_NUMBER"),
    bankIfsc: env("INVOICE_BANK_IFSC"),
    upiId: env("INVOICE_UPI_ID"),
  };
}

export function renderTaxInvoice(input: InvoiceInput) {
  const s = seller();
  const gstPercent = input.gstPercent ?? 18;
  const halfPercent = gstPercent / 2;
  const issued = toDate(input.issuedAt) || new Date();

  const lines = input.items.filter((item) => Number(item.amountInr) > 0).map((item) => {
    const amountPaise = Math.round(Number(item.amountInr) * 100);
    const taxablePaise = Math.round((amountPaise * 100) / (100 + gstPercent));
    const taxPaise = amountPaise - taxablePaise;
    const cgstPaise = Math.floor(taxPaise / 2);
    const quantity = item.quantity || 1;
    return { ...item, quantity, amountPaise, taxablePaise, cgstPaise, sgstPaise: taxPaise - cgstPaise, ratePaise: Math.round(taxablePaise / quantity) };
  });
  const sum = (key: "amountPaise" | "taxablePaise" | "cgstPaise" | "sgstPaise") => lines.reduce((total, line) => total + line[key], 0);
  const totalPaise = sum("amountPaise");
  const taxablePaise = sum("taxablePaise");
  const cgstPaise = sum("cgstPaise");
  const sgstPaise = sum("sgstPaise");
  const roundOffPaise = totalPaise - taxablePaise - cgstPaise - sgstPaise;

  const paid = input.payment.status === "paid";
  const statusLabel = paid ? `PAID · ${input.payment.mode.toUpperCase()}` : "PAYMENT UNDER REVIEW";
  const serviceWhen = [formatDate(input.service.date), formatTime(input.service.time)].filter(Boolean).join(", ");
  const bookingRef = input.bookingId ? `BKG-${String(input.bookingId).replaceAll("-", "").slice(0, 8).toUpperCase()}` : "";

  const kv = (label: string, value: unknown) => clean(value) ? `<div class="kv"><span>${esc(label)}:</span> ${esc(value)}</div>` : "";
  const metaRow = (label: string, value: unknown) => clean(value) ? `<div><span>${esc(label)}:</span> <strong>${esc(value)}</strong></div>` : "";

  const itemRows = lines.map((line, index) => `<tr>
      <td class="c-idx">${index + 1}</td>
      <td class="c-desc"><div class="item-title">${esc(line.description)}</div>${line.detail ? `<div class="item-detail">${esc(line.detail)}</div>` : ""}</td>
      <td>${esc(line.sac || DEFAULT_SAC)}</td>
      <td class="num">${line.quantity} ${esc(line.unit || "Service")}</td>
      <td class="num">${money(line.ratePaise)}</td>
      <td class="num">${money(line.taxablePaise)}</td>
      <td class="num">${money(line.cgstPaise)}</td>
      <td class="num">${money(line.sgstPaise)}</td>
      <td class="num strong">${money(line.amountPaise)}</td>
    </tr>`).join("");

  const bankRows = [
    kv("Bank", s.bankName),
    kv("A/C Name", s.bankAccountName),
    kv("A/C No", s.bankAccountNumber),
    kv("IFSC", s.bankIfsc),
    kv("UPI", s.upiId),
  ].join("");
  const paymentRows = [
    kv("Payment Mode", input.payment.mode),
    kv("Payment Status", paid ? "Paid" : "Under review"),
    kv("Paid On", paid ? formatDateTime(toDate(input.payment.paidAt) || issued) : ""),
    kv("Reference", input.payment.reference),
    bankRows,
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tax Invoice ${esc(input.invoiceNumber)}</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#f1eadf;color:#2b2422;font-family:"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans Kannada",sans-serif;font-size:10.5px;line-height:1.42}
.page{width:794px;max-width:100%;min-height:1123px;margin:24px auto;background:#fff;padding:30px 40px 18px;display:flex;flex-direction:column}
.serif{font-family:Georgia,"Times New Roman",serif}
.maroon{color:#8a1c2b}
.label{color:#b07a2a;font-size:9px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;margin-bottom:6px}
.head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:1px solid #eadfd3}
.logo{width:104px;height:auto;display:block}
.title{text-align:right}
.title h1{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:27px;letter-spacing:1.2px;color:#8a1c2b}
.title .copy{color:#b07a2a;font-size:9px;font-weight:700;letter-spacing:1px;margin:2px 0 8px}
.title .meta div{color:#7a706a;margin-top:1px}
.title .meta strong{color:#2b2422}
.parties{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;padding:14px 0;border-bottom:1px solid #eadfd3}
.party-name{font-family:Georgia,"Times New Roman",serif;font-size:15px;font-weight:700;margin-bottom:3px}
.kv{color:#5f5752;margin-top:1px;word-break:break-word}
.kv span{color:#2b2422;font-weight:700}
table.items{width:100%;border-collapse:separate;border-spacing:0;margin-top:14px}
table.items th{background:#8a1c2b;color:#fff;font-size:9.5px;font-weight:700;text-align:left;padding:9px 7px;vertical-align:middle}
table.items th:first-child{border-radius:10px 0 0 10px;padding-left:14px}
table.items th:last-child{border-radius:0 10px 10px 0;padding-right:14px}
table.items td{padding:9px 7px;border-bottom:1px solid #eadfd3;vertical-align:top}
table.items td:first-child{padding-left:14px}
table.items td:last-child{padding-right:14px}
.num{text-align:right;white-space:nowrap}
th.num{text-align:right}
.strong{font-weight:700}
.c-idx{width:26px}
.c-desc{width:34%}
.item-title{font-weight:700;font-size:11.5px}
.item-detail{color:#7a706a;font-size:9.5px;margin-top:3px}
.summary{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:14px 0;border-bottom:1px solid #eadfd3}
table.tax{width:100%;border-collapse:collapse}
table.tax th{font-size:9.5px;color:#5f5752;font-weight:600;text-align:left;padding:4px 0;border-bottom:1px solid #eadfd3}
table.tax td{padding:6px 0;font-size:10.5px}
table.tax .num{text-align:right}
.words{margin-top:12px;background:#fbf5ec;border-radius:10px;padding:10px 12px}
.words .text{font-size:12px;font-weight:600;color:#2b2422}
.totals .row{display:flex;justify-content:space-between;padding:3px 0;color:#5f5752;font-size:11.5px}
.totals .row strong{color:#2b2422;font-weight:500}
.grand{display:flex;justify-content:space-between;align-items:center;background:#8a1c2b;color:#fff;border-radius:10px;padding:10px 16px;margin-top:6px}
.grand .g-label{font-family:Georgia,"Times New Roman",serif;font-size:14px;font-weight:700}
.grand .g-value{font-size:20px;font-weight:800}
.badge-wrap{text-align:right;margin-top:8px}
.badge{display:inline-block;border-radius:999px;padding:4px 12px;font-size:9px;font-weight:800;letter-spacing:.6px}
.badge.paid{background:#e6f4ea;color:#1e7a3c}
.badge.review{background:#fff3e0;color:#b45309}
.notes{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:14px 0}
.notes ul{margin:0;padding-left:14px;color:#5f5752}
.notes li{margin-bottom:3px}
.sign{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;padding:16px 0 12px}
.blessing{font-size:16px;color:#b07a2a;font-family:"Noto Sans Kannada","Noto Serif Kannada",Georgia,serif}
.signatory{text-align:right}
.signatory .line{border-top:1px solid #2b2422;width:160px;margin-left:auto;padding-top:6px;font-weight:700}
.signatory .for{color:#7a706a;font-size:10px}
.footer{border-top:1px solid #eadfd3;padding-top:8px;text-align:center;color:#7a706a;font-size:9.5px}
@media print{body{background:#fff}.page{margin:0;width:100%;min-height:296mm}}
@media (max-width:640px){.page{padding:24px 18px;margin:0;min-height:0}.parties,.summary,.notes{grid-template-columns:1fr;gap:18px}table.items{font-size:10px}}
</style>
</head>
<body>
<main class="page">
  <header class="head">
    <img class="logo" src="${INVOICE_LOGO_DATA_URI}" alt="PurohithConnect">
    <div class="title">
      <h1>TAX INVOICE</h1>
      <div class="copy">ORIGINAL FOR RECIPIENT</div>
      <div class="meta">
        ${metaRow("Invoice No", input.invoiceNumber)}
        ${metaRow("Invoice Date", formatDate(issued))}
        ${metaRow("Due Date", formatDate(issued))}
        ${metaRow("Booking ID", bookingRef)}
      </div>
    </div>
  </header>

  <section class="parties">
    <div>
      <div class="label">Billed By</div>
      <div class="party-name maroon">${esc(s.brand)}</div>
      ${s.legalName !== s.brand ? `<div class="kv">${esc(s.legalName)}</div>` : ""}
      ${s.address ? `<div class="kv">${esc(s.address)}</div>` : ""}
      ${kv("GSTIN", s.gstin)}
      ${kv("PAN", s.pan)}
      ${kv("Phone", s.phone)}
      ${kv("Email", s.email)}
      ${kv("Web", s.website)}
    </div>
    <div>
      <div class="label">Billed To</div>
      <div class="party-name">${esc(input.customer.name || "Customer")}</div>
      ${input.customer.address ? `<div class="kv">${esc(input.customer.address)}</div>` : ""}
      ${kv("Phone", maskPhone(input.customer.phone))}
      ${kv("Email", input.customer.email)}
      ${kv("GSTIN", input.customer.gstin || "Unregistered (B2C)")}
    </div>
    <div>
      <div class="label">Service Details</div>
      ${kv("Place of Supply", `${s.state} (${s.stateCode})`)}
      ${kv("Ceremony", input.service.ceremony)}
      ${kv("Date of Service", serviceWhen)}
      ${kv("Venue", input.service.venue || "Customer residence")}
      ${kv("Payment Mode", input.payment.mode)}
    </div>
  </section>

  <table class="items">
    <thead><tr>
      <th>#</th><th>Description</th><th>SAC</th><th class="num">Qty</th><th class="num">Rate (₹)</th>
      <th class="num">Taxable (₹)</th><th class="num">CGST ${halfPercent}%</th><th class="num">SGST ${halfPercent}%</th><th class="num">Amount (₹)</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <section class="summary">
    <div>
      <div class="label">Tax Summary</div>
      <table class="tax">
        <thead><tr><th>Taxable Value</th><th class="num">CGST (${halfPercent}%)</th><th class="num">SGST (${halfPercent}%)</th><th class="num">Total Tax</th></tr></thead>
        <tbody><tr><td>₹${money(taxablePaise)}</td><td class="num">₹${money(cgstPaise)}</td><td class="num">₹${money(sgstPaise)}</td><td class="num strong">₹${money(cgstPaise + sgstPaise)}</td></tr></tbody>
      </table>
      <div class="words">
        <div class="label">Amount in Words</div>
        <div class="text">${esc(amountInWords(totalPaise))}</div>
      </div>
    </div>
    <div class="totals">
      <div class="row"><span>Subtotal (Taxable Value)</span><strong>₹${money(taxablePaise)}</strong></div>
      <div class="row"><span>CGST @ ${halfPercent}%</span><strong>₹${money(cgstPaise)}</strong></div>
      <div class="row"><span>SGST @ ${halfPercent}%</span><strong>₹${money(sgstPaise)}</strong></div>
      <div class="row"><span>Round Off</span><strong>₹${money(roundOffPaise)}</strong></div>
      <div class="grand"><span class="g-label">Grand Total</span><span class="g-value">₹${money(totalPaise)}</span></div>
      <div class="badge-wrap"><span class="badge ${paid ? "paid" : "review"}">${esc(statusLabel)}</span></div>
    </div>
  </section>

  <section class="notes">
    <div>
      <div class="label">Payment Details</div>
      ${paymentRows}
    </div>
    <div>
      <div class="label">Terms &amp; Notes</div>
      <ul>
        <li>Dakshina is offered with respect to the purohith for performing the ceremony.</li>
        <li>Samagri charges apply only when purohith-provided samagri is selected.</li>
        <li>Prices are inclusive of the itemised amounts above; there are no hidden charges.</li>
        <li>Cancellations 24+ hrs before the muhurta are fully refundable (excl. gateway fees).</li>
      </ul>
    </div>
  </section>

  <section class="sign">
    <div class="blessing">|| ಶುಭಮಸ್ತು ||</div>
    <div class="signatory">
      <div class="line">Authorised Signatory</div>
      <div class="for">for ${esc(s.brand)}</div>
    </div>
  </section>

  <footer class="footer">This is a computer-generated invoice and does not require a physical signature. · ${esc(s.brand)} — Your Trusted Partner for Sacred Occasions${s.website ? ` · ${esc(s.website)}` : ""}</footer>
</main>
</body>
</html>`;
}

export function renderBookingInvoice({ invoiceNumber, booking, amountInr, payment, issuedAt }: {
  invoiceNumber: string;
  booking: any;
  amountInr: number;
  payment: InvoiceInput["payment"];
  issuedAt?: string | Date | null;
}) {
  const ceremony = clean(booking?.pooja_name) || "Ceremony booking";
  const priest = clean(booking?.priest_name);
  return renderTaxInvoice({
    invoiceNumber,
    issuedAt: issuedAt || booking?.invoice_issued_at || undefined,
    bookingId: booking?.id,
    customer: {
      name: booking?.customer_name,
      address: [booking?.address, booking?.landmark].map(clean).filter(Boolean).join(", "),
      phone: booking?.customer_phone,
      email: booking?.customer_email,
    },
    service: {
      ceremony,
      date: booking?.booking_date || booking?.ceremony_date,
      time: booking?.booking_time || booking?.ceremony_time,
    },
    payment,
    items: [{
      description: `${ceremony} — Purohith performance & Dakshina`,
      detail: [priest ? `Performed by ${priest}` : "", "Verified purohith"].filter(Boolean).join(" · "),
      sac: DEFAULT_SAC,
      quantity: 1,
      unit: "Service",
      amountInr,
    }],
  });
}

function money(paise: number) {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: unknown) {
  const text = clean(value instanceof Date ? value.toISOString() : value);
  if (!text) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00+05:30`) : toDate(text);
  return date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : text;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

function formatTime(value: unknown) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return clean(value);
  const hours = Number(match[1]);
  return `${String(hours % 12 || 12).padStart(2, "0")}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

function maskPhone(value: unknown) {
  const digits = clean(value).replace(/\D/g, "").slice(-10);
  if (digits.length < 10) return clean(value);
  return `+91 ${digits.slice(0, 2)}xxx xxx${digits.slice(8)}`;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const restWords = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ONES[rest % 10]}` : ""}`;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", restWords].filter(Boolean).join(" ");
}

function indianWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${indianWords(crore)} Crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

function amountInWords(paise: number) {
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  return `Indian Rupees ${indianWords(rupees)}${remainder ? ` and ${belowThousand(remainder)} Paise` : ""} Only`;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function esc(value: unknown) {
  return clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] || char));
}
