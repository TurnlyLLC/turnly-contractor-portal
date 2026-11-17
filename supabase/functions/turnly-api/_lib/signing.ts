// Builds the signed copy of an onboarding document: the original pages with a
// small "signed electronically" footer, followed by a signature certificate
// (signer, time, account, device, field answers, consent, document hash).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";

export type SignatureInfo = {
  documentTitle: string;
  description: string | null;
  version: number;
  templateSha256: string | null;
  signerName: string;
  email: string | null;
  userId: string;
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
  /** Answers to print. Sensitive ones must already be masked by the caller. */
  fields: { label: string; value: string; section?: string | null }[];
  consent: string;
};

const NAVY = rgb(0x16 / 255, 0x23 / 255, 0x3b / 255);
const GOLD = rgb(0xc9 / 255, 0xa2 / 255, 0x4b / 255);
const MUTED = rgb(0x5b / 255, 0x64 / 255, 0x74 / 255);
const PAGE: [number, number] = [612, 792];
const MARGIN = 54;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Standard PDF fonts only cover WinAnsi; swap common Unicode punctuation and drop the rest. */
export function winAnsi(value: string): string {
  return value
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/\u2022/g, "-")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n\x20-\x7E\xA1-\xFF]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of winAnsi(text).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Break very long tokens (URLs, IDs) so they never run off the page.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Simple top-down text writer that starts new pages as needed. */
class Writer {
  page: PDFPage;
  y: number;
  constructor(private doc: PDFDocument, private onNewPage: (page: PDFPage) => number) {
    this.page = doc.addPage(PAGE);
    this.y = onNewPage(this.page);
  }
  ensure(height: number) {
    if (this.y - height >= MARGIN) return;
    this.page = this.doc.addPage(PAGE);
    this.y = this.onNewPage(this.page);
  }
  text(value: string, font: PDFFont, size: number, color = NAVY, gap = 4) {
    const width = PAGE[0] - MARGIN * 2;
    for (const line of wrap(value, font, size, width)) {
      this.ensure(size + gap);
      this.y -= size;
      if (line) this.page.drawText(line, { x: MARGIN, y: this.y, size, font, color });
      this.y -= gap;
    }
  }
  space(height: number) {
    this.y -= height;
  }
  rule(color = GOLD, thickness = 1) {
    this.ensure(8);
    this.y -= 4;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE[0] - MARGIN, y: this.y }, thickness, color });
    this.y -= 8;
  }
  /** Question above its answer; for long prompts (form questions, agreement statements). */
  qa(label: string, value: string, labelFont: PDFFont, valueFont: PDFFont) {
    const width = PAGE[0] - MARGIN * 2;
    const labelLines = wrap(label, labelFont, 8.5, width);
    const valueLines = wrap(value || "-", valueFont, 10.5, width);
    this.ensure(Math.min(labelLines.length * 12 + valueLines.length * 14 + 8, 200));
    for (const line of labelLines) {
      this.ensure(12);
      this.y -= 8.5;
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 8.5, font: labelFont, color: MUTED });
      this.y -= 3.5;
    }
    this.y -= 1;
    for (const line of valueLines) {
      this.ensure(14);
      this.y -= 10.5;
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 10.5, font: valueFont, color: NAVY });
      this.y -= 3.5;
    }
    this.y -= 7;
  }
  row(label: string, value: string, labelFont: PDFFont, valueFont: PDFFont) {
    const size = 10;
    const labelWidth = 150;
    const width = PAGE[0] - MARGIN * 2 - labelWidth;
    const lines = wrap(value || "-", valueFont, size, width);
    this.ensure(lines.length * (size + 4) + 4);
    this.y -= size;
    this.page.drawText(winAnsi(label.toUpperCase()), { x: MARGIN, y: this.y, size: 7.5, font: labelFont, color: MUTED });
    lines.forEach((line, index) => {
      this.page.drawText(line, { x: MARGIN + labelWidth, y: this.y - index * (size + 4), size, font: valueFont, color: NAVY });
    });
    this.y -= (lines.length - 1) * (size + 4) + 8;
  }
}

function utc(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

/** Throws a readable error when a template can't be used (encrypted or not a PDF). */
export async function validateTemplate(bytes: Uint8Array): Promise<number> {
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("Upload a PDF file.");
  }
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return doc.getPageCount();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/encrypt/i.test(message)) throw new Error("This PDF is password-protected. Upload an unlocked copy.");
    throw new Error("This PDF couldn't be read. Try exporting it again as a standard PDF.");
  }
}

export async function buildSignedPdf(template: Uint8Array | null, info: SignatureInfo): Promise<Uint8Array> {
  const doc = template ? await PDFDocument.load(template, { updateMetadata: false }) : await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const script = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
  const signedAt = utc(info.signedAt);

  // Items without an uploaded PDF (in-app forms, acknowledgements) get the
  // instructions and every answer as the document body.
  const answersInBody = !template && info.fields.length > 0;
  if (!template) {
    const writer = new Writer(doc, () => PAGE[1] - MARGIN);
    writer.text("TURNLY LLC", bold, 8, GOLD, 6);
    writer.text(info.documentTitle, serif, 20, NAVY, 8);
    writer.rule();
    if (info.description?.trim()) {
      writer.text(info.description.trim(), regular, 10, MUTED, 4);
      writer.space(6);
    }
    if (!answersInBody && !info.description?.trim()) writer.text("Acknowledgement", regular, 11, NAVY, 5);
    let section: string | null | undefined;
    for (const field of answersInBody ? info.fields : []) {
      if (field.section !== section) {
        section = field.section;
        writer.space(8);
        writer.ensure(40);
        writer.text((section ?? "Answers").toUpperCase(), bold, 8.5, GOLD, 4);
        writer.rule(GOLD, 0.6);
      }
      writer.qa(field.label, field.value, regular, bold);
    }
  }

  const footer = winAnsi(`Signed electronically by ${info.signerName} on ${signedAt} via Turnly Pro`);
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    const size = 7;
    const textWidth = regular.widthOfTextAtSize(footer, size);
    page.drawText(footer, { x: Math.max(18, (width - textWidth) / 2), y: 12, size, font: regular, color: MUTED });
  }

  const writer = new Writer(doc, (page) => {
    page.drawRectangle({ x: 0, y: PAGE[1] - 70, width: PAGE[0], height: 70, color: NAVY });
    page.drawText("Turnly Pro", { x: MARGIN, y: PAGE[1] - 44, size: 20, font: serif, color: rgb(1, 1, 1) });
    page.drawText("ELECTRONIC SIGNATURE CERTIFICATE", {
      x: PAGE[0] - MARGIN - bold.widthOfTextAtSize("ELECTRONIC SIGNATURE CERTIFICATE", 8),
      y: PAGE[1] - 41,
      size: 8,
      font: bold,
      color: GOLD,
    });
    return PAGE[1] - 100;
  });

  writer.text(info.documentTitle, serif, 18, NAVY, 6);
  writer.text(`Version ${info.version}`, regular, 9, MUTED, 10);

  writer.ensure(80);
  writer.space(12);
  writer.text(info.signerName, script, 28, NAVY, 2);
  writer.rule(NAVY, 0.8);
  writer.text("Electronic signature (typed name adopted as signature)", regular, 8, MUTED, 14);

  writer.row("Signer", info.signerName, bold, regular);
  writer.row("Account email", info.email ?? "-", bold, regular);
  writer.row("Account ID", info.userId, bold, regular);
  writer.row("Signed at", signedAt, bold, regular);
  writer.row("IP address", info.ip ?? "-", bold, regular);
  writer.row("Device", info.userAgent ?? "-", bold, regular);
  if (info.templateSha256) writer.row("Document SHA-256", info.templateSha256, bold, regular);

  if (info.fields.length > 0 && !answersInBody) {
    writer.space(8);
    writer.text("INFORMATION PROVIDED BY SIGNER", bold, 8, GOLD, 6);
    writer.rule();
    for (const field of info.fields) {
      if (field.label.length > 34) writer.qa(field.label, field.value, regular, bold);
      else writer.row(field.label, field.value, bold, regular);
    }
  } else if (answersInBody) {
    writer.row("Answers", `${info.fields.length} answers on the preceding page(s)`, bold, regular);
  }

  writer.space(8);
  writer.text("CONSENT", bold, 8, GOLD, 6);
  writer.rule();
  writer.text(info.consent, regular, 9.5, NAVY, 4);

  doc.setTitle(winAnsi(`${info.documentTitle} - signed by ${info.signerName}`));
  doc.setProducer("Turnly Pro");
  doc.setCreator("Turnly Pro onboarding");
  doc.setModificationDate(info.signedAt);
  return doc.save();
}

