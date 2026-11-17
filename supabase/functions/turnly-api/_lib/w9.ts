// Fills the official IRS Form W-9 (Rev. March 2024) from in-app answers.
// Questions carry a `w9=` tag naming the line they answer; the filled form is
// flattened and signed with the contractor's typed name on the signature line.

import { PDFDocument, PDFTextField, PDFCheckBox, StandardFonts, rgb, type PDFForm } from "npm:pdf-lib@1.17.1";
import { winAnsi } from "./signing.ts";

/** Answers keyed by W-9 line tag (1, 2, 3a, 3a-llc, 3a-other, 3b, 4-payee, 4-fatca, 5, 6, 7, tin-type, tin, cert, backup). */
export type W9Values = Record<string, string>;

export const W9_REQUESTER = "Turnly LLC\n144 E King St STE 303\nHillsborough, NC 27278";

const CLASSIFICATIONS: { box: number; test: RegExp }[] = [
  { box: 0, test: /individual|sole/i },
  { box: 1, test: /^c\b|c[\s-]*corp/i },
  { box: 2, test: /^s\b|s[\s-]*corp/i },
  { box: 3, test: /partnership/i },
  { box: 4, test: /trust|estate/i },
  { box: 5, test: /llc|limited liability/i },
  { box: 6, test: /other/i },
];

function classificationBox(value: string): number | null {
  return CLASSIFICATIONS.find((c) => c.test.test(value.trim()))?.box ?? null;
}

const isYes = (value: string | undefined) => value === "Agreed" || value === "Yes";

/** What the contractor still needs to fix before the W-9 can be filled, or null. */
export function w9Problem(values: W9Values): string | null {
  if (!values["1"]) return "Line 1: enter your name.";
  const box = classificationBox(values["3a"] ?? "");
  if (box === null) return "Line 3a: choose a federal tax classification.";
  if (box === 5 && !/^[CSP]/i.test((values["3a-llc"] ?? "").trim())) {
    return "Line 3a: you chose LLC, so also choose its tax classification (C, S, or P).";
  }
  if (box === 6 && !(values["3a-other"] ?? "").trim()) return "Line 3a: you chose Other, so describe the classification.";
  if (!values["5"] || !values["6"]) return "Lines 5 and 6: enter your address.";
  const tin = (values.tin ?? "").replace(/\D/g, "");
  if (tin.length !== 9) return "Part I: enter your 9-digit SSN or EIN.";
  if (!values["tin-type"]) return "Part I: choose SSN or EIN.";
  if (!isYes(values.cert)) return "Part II: check the certification box.";
  return null;
}

function field<T>(form: PDFForm, suffix: string, kind: { prototype: T }): T {
  const match = form.getFields().find((f) => f.getName().endsWith(suffix));
  if (!match || !(match instanceof (kind as unknown as typeof Object))) throw new Error(`W-9 field ${suffix} not found`);
  return match as T;
}

/** Returns the filled, flattened W-9 with the typed signature and date. Throws if the PDF isn't the expected W-9. */
export async function fillW9(template: Uint8Array, values: W9Values, signerName: string, signedAt: Date): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template, { updateMetadata: false });
  const form = doc.getForm();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const script = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);

  const text = (suffix: string, value: string | undefined, size = 10) => {
    const f = field(form, suffix, PDFTextField);
    const clean = winAnsi((value ?? "").trim());
    if (!clean) return;
    const max = f.getMaxLength();
    f.setText(max ? clean.slice(0, max) : clean);
    if (!f.isCombed()) f.setFontSize(size);
  };
  const check = (suffix: string) => field(form, suffix, PDFCheckBox).check();

  text("f1_01[0]", values["1"]);
  text("f1_02[0]", values["2"]);

  const box = classificationBox(values["3a"] ?? "");
  if (box !== null) check(`c1_1[${box}]`);
  if (box === 5) text("f1_03[0]", (values["3a-llc"] ?? "").trim().charAt(0).toUpperCase());
  if (box === 6) text("f1_04[0]", values["3a-other"], 8);
  if (isYes(values["3b"])) check("c1_2[0]");

  text("f1_05[0]", values["4-payee"], 8);
  text("f1_06[0]", values["4-fatca"], 8);
  text("f1_07[0]", values["5"]);
  text("f1_08[0]", values["6"]);
  const requester = field(form, "f1_09[0]", PDFTextField);
  requester.enableMultiline();
  requester.setText(W9_REQUESTER);
  requester.setFontSize(8);
  text("f1_10[0]", values["7"]);

  const tin = (values.tin ?? "").replace(/\D/g, "");
  if (/ein|employer/i.test(values["tin-type"] ?? "")) {
    text("f1_14[0]", tin.slice(0, 2));
    text("f1_15[0]", tin.slice(2, 9));
  } else {
    text("f1_11[0]", tin.slice(0, 3));
    text("f1_12[0]", tin.slice(3, 5));
    text("f1_13[0]", tin.slice(5, 9));
  }

  form.updateFieldAppearances(helvetica);
  form.flatten();

  const page = doc.getPage(0);
  const navy = rgb(0x16 / 255, 0x23 / 255, 0x3b / 255);
  // Certification instructions: cross out item 2 when the IRS says backup withholding applies.
  if (isYes(values.backup)) {
    for (const [x1, x2, y] of [[45, 576, 306.3], [54, 576, 296.7], [54, 210, 287.1]]) {
      page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.9, color: navy });
    }
  }
  const name = winAnsi(signerName);
  page.drawText(name, { x: 134, y: 197, size: Math.min(15, (370 - 134) / Math.max(1, script.widthOfTextAtSize(name, 1))), font: script, color: navy });
  const date = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "America/New_York" }).format(signedAt);
  page.drawText(date, { x: 412, y: 198, size: 10, font: helvetica, color: navy });
  return doc.save();
}

