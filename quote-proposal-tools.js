const PDF_LIB_URL = "/assets/vendor/pdf-lib.min.js?v=20260909-quote-pdf";
const QUOTE_TEMPLATE_URL = "/assets/turnly-quote-proposal-template.pdf?v=20260909-quote-template";
const QUOTE_FROM_EMAIL = "sales@turnlypros.com";
const QUOTE_FROM_NAME = "Turnly Sales";

let pdfLibPromise = null;

function cleanHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value) {
  const clean = cleanHeader(value);
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(clean)))}?=`;
}

function quoteDisplayName(value) {
  const clean = cleanHeader(value).replace(/"/g, '\\"');
  return clean ? `"${clean}"` : "";
}

function formatMailbox(name, email) {
  const cleanEmail = cleanHeader(email);
  if (!cleanEmail) return "";
  const displayName = quoteDisplayName(name);
  return displayName ? `${displayName} <${cleanEmail}>` : cleanEmail;
}

function wrapBase64(value) {
  return String(value || "").replace(/.{1,76}/g, "$&\r\n").trim();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks = [];
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return btoa(chunks.join(""));
}

function safeFileName(value, fallback) {
  const clean = String(value || "")
    .replace(/[^a-z0-9._ -]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function quoteSenderEmail() {
  return QUOTE_FROM_EMAIL;
}

export function quoteDraftFileName(pdfFileName) {
  return safeFileName(String(pdfFileName || "Turnly-Quote-Proposal.pdf").replace(/\.pdf$/i, ".eml"), "Turnly-Quote-Draft.eml");
}

export function quoteGmailComposeUrl({ toEmail, subject, body }) {
  const cleanTo = cleanHeader(toEmail);
  if (!cleanTo) throw new Error("Add the property manager email before opening Gmail.");
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    tf: "cm",
    authuser: QUOTE_FROM_EMAIL,
    to: cleanTo,
    su: cleanHeader(subject),
    body: String(body || "")
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export async function openGmailQuoteDraft({
  toEmail,
  subject,
  body,
  pdfBlob,
  pdfFileName
}) {
  const gmailUrl = quoteGmailComposeUrl({ toEmail, subject, body });
  if (pdfBlob) {
    downloadBlob(pdfBlob, safeFileName(pdfFileName, "Turnly-Quote-Proposal.pdf"));
  }
  const composeWindow = window.open(gmailUrl, "_blank", "noopener");
  if (!composeWindow) window.location.href = gmailUrl;
  return { url: gmailUrl, from: QUOTE_FROM_EMAIL, to: cleanHeader(toEmail) };
}

export function triggerBlobDownload(blob, fileName) {
  downloadBlob(blob, fileName);
}

export function loadPdfLib() {
  if (window.PDFLib?.PDFDocument) return Promise.resolve(window.PDFLib);
  if (pdfLibPromise) return pdfLibPromise;
  pdfLibPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-turnly-pdf-lib]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.PDFLib), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load PDF tools.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = PDF_LIB_URL;
    script.async = true;
    script.dataset.turnlyPdfLib = "true";
    script.addEventListener("load", () => {
      if (window.PDFLib?.PDFDocument) resolve(window.PDFLib);
      else reject(new Error("PDF tools loaded without the expected API."));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load PDF tools.")), { once: true });
    document.head.appendChild(script);
  });
  return pdfLibPromise;
}

export async function generateTurnlyQuotePdf({ fieldValues, fileName }) {
  const { PDFDocument, StandardFonts } = await loadPdfLib();
  const response = await fetch(QUOTE_TEMPLATE_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load the Turnly quote template.");

  const pdfDoc = await PDFDocument.load(await response.arrayBuffer());
  const pdfForm = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fieldNames = new Set(pdfForm.getFields().map((field) => field.getName()));
  const matchedFields = Object.keys(fieldValues || {}).filter((name) => fieldNames.has(name));
  if (!matchedFields.length) throw new Error("The Turnly quote template does not have the expected fillable fields.");

  matchedFields.forEach((name) => {
    pdfForm.getTextField(name).setText(String(fieldValues[name] || ""));
  });
  pdfForm.updateFieldAppearances(font);

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  return {
    blob,
    fileName: safeFileName(fileName, "Turnly-Quote-Proposal.pdf")
  };
}

export async function createQuoteEmailDraft({
  toEmail,
  toName,
  subject,
  body,
  pdfBlob,
  pdfFileName,
  draftFileName
}) {
  const cleanTo = cleanHeader(toEmail);
  if (!cleanTo) throw new Error("Add the property manager email before creating the quote email draft.");
  if (!pdfBlob) throw new Error("Generate the quote PDF before creating the email draft.");

  const boundary = `turnly_quote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const attachmentName = safeFileName(pdfFileName, "Turnly-Quote-Proposal.pdf");
  const attachmentBase64 = wrapBase64(arrayBufferToBase64(await pdfBlob.arrayBuffer()));
  const draft = [
    "X-Unsent: 1",
    `From: ${formatMailbox(QUOTE_FROM_NAME, QUOTE_FROM_EMAIL)}`,
    `To: ${formatMailbox(toName, cleanTo)}`,
    `Reply-To: ${QUOTE_FROM_EMAIL}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    String(body || "").replace(/\r?\n/g, "\r\n"),
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${attachmentName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${attachmentName}"`,
    "",
    attachmentBase64,
    "",
    `--${boundary}--`,
    ""
  ].join("\r\n");

  const blob = new Blob([draft], { type: "message/rfc822" });
  const fileName = safeFileName(draftFileName || quoteDraftFileName(attachmentName), "Turnly-Quote-Draft.eml");
  downloadBlob(blob, fileName);
  return { blob, fileName, from: QUOTE_FROM_EMAIL, to: cleanTo };
}
