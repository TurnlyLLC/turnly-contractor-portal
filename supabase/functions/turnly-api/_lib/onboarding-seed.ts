// Turnly's starting onboarding checklist, loaded once into an empty OnboardingHub.
// Everything here stays editable on /onboarding/admin afterwards (titles, text,
// questions, PDFs, required/visible, order).
//
// Question lines use the admin page format:
//   ## Section
//   Label * [type: A | B, sensitive, confirm, prefill=name] -- help text
//
// Contact details are asked once, in Contractor Information (save=key), and
// reused: profile=key fills a question from it (asked only if missing);
// prefill=key starts a visible answer from it. w9=line fills the IRS W-9.

const ATTACHMENTS = "https://retired-template-source.invalid/attachments";

export type SeedItem = {
  kind: "sign" | "upload" | "form" | "video";
  title: string;
  description: string;
  questions?: string;
  pdfUrl?: string;
  pdfName?: string;
  requiresExpiration?: boolean;
  requiresReview?: boolean;
  required?: boolean;
};

const INTAKE = String.raw`
## Contractor Information
Full legal name * [text, prefill=name, save=name]
Preferred name [text]
Date of birth * [date, sensitive]
Home address * [text, save=address] -- Street address and apt. or suite number
City * [text, save=city]
State * [text, save=state]
ZIP * [number, save=zip]
Phone number * [phone, prefill=phone, save=phone]
Email address * [email, prefill=email, save=email]
Business name, if you have one [text, save=business_name]
Driver's license number * [text, sensitive]
License state issued * [text]
License expiration date * [date]
## Emergency Contacts
Primary contact - full name * [text]
Primary contact - relationship * [text]
Primary contact - primary phone * [phone]
Primary contact - secondary phone [phone]
Primary contact - email [email]
Secondary contact - full name [text] -- Optional
Secondary contact - relationship [text]
Secondary contact - primary phone [phone]
Secondary contact - secondary phone [phone]
Secondary contact - email [email]
## Availability
Available immediately? * [yesno]
Preferred start date [date]
Monday [multi: Morning | Afternoon | Evening] -- Leave blank if you can't work this day
Tuesday [multi: Morning | Afternoon | Evening]
Wednesday [multi: Morning | Afternoon | Evening]
Thursday [multi: Morning | Afternoon | Evening]
Friday [multi: Morning | Afternoon | Evening]
Saturday [multi: Morning | Afternoon | Evening]
Sunday [multi: Morning | Afternoon | Evening]
## Assignment Preferences
Assignments you're interested in * [multi: Residential Cleaning | Apartment Turnovers | Deep Cleaning | Move-In / Move-Out Cleaning | Weekend Assignments | Emergency Assignments | Overnight Assignments | Same-Day Assignments] -- Choose all that apply
## Transportation
Reliable transportation? * [yesno]
Vehicle make [text]
Vehicle model [text]
Vehicle year [number]
Maximum travel distance, one way (miles) * [number]
Willing to travel outside your local area? * [yesno]
## Experience & Qualifications
Years of cleaning experience * [number]
Commercial cleaning experience * [text] -- Type "None" if you don't have any
Apartment turnover experience * [text] -- Type "None" if you don't have any
Special skills / services offered [multi: Carpet Cleaning | Floor Buffing | Floor Stripping & Waxing | Window Cleaning | Pressure Washing | Post Construction Cleaning]
Other skills or services [text]
## Technology Requirements
Smartphone available? * [yesno]
Can upload photos? * [yesno]
Can upload videos? * [yesno]
Preferred contact method * [choice: Text | Call | Email]
## Background Check Authorization
I authorize Turnly LLC and its designated agents to obtain and review background information relating to my eligibility to perform assignments on behalf of Turnly LLC. This authorization may include criminal history records, identity verification, driving records, employment verification, and other legally permissible background information. * [check]
I certify that the information provided in this document is true and accurate. * [check]
## Contractor Certification
I certify that the information provided is accurate and complete. * [check]
I understand that completing this form does not guarantee assignments. * [check]
I understand that Turnly LLC contracts with independent contractors and does not guarantee work, hours, or income. * [check]
I understand that assignment opportunities may be offered based upon availability, qualifications, performance, client requirements, and business needs. * [check]
`;

const DIRECT_DEPOSIT = String.raw`
## Contractor Information
Full legal name * [text, profile=name]
Phone number * [phone, profile=phone]
Email address * [email, profile=email]
Mailing address * [text, profile=address]
City, State, ZIP * [text, profile=city_state_zip]
## Bank Account
Bank name * [text]
Account type * [choice: Checking | Savings]
Routing number * [routing, sensitive, confirm] -- The 9-digit number at the bottom left of a check
Account number * [account, sensitive, confirm]
Name(s) on account * [text]
## Authorization
I authorize Turnly LLC to initiate electronic deposits to the account listed above. I understand that it is my responsibility to notify Turnly LLC of any banking changes. I further understand that Turnly LLC may reverse any deposit made in error to the extent permitted by law. * [check]
`;

const AGREEMENT_FIELDS = String.raw`
Legal name * [text, profile=name]
Business name (if applicable) [text, profile=business_name]
Address * [text, profile=address]
City/State/Zip * [text, profile=city_state_zip]
Phone * [phone, profile=phone]
Email * [email, profile=email]
`;

/** IRS Form W-9 (Rev. March 2024), numbered exactly like the form. */
const W9_FIELDS = String.raw`
## Lines 1–2 · Name
1. Name of entity/individual * [text, w9=1, prefill=name] -- As shown on your income tax return. For a sole proprietor or individual, enter your own name.
2. Business name/disregarded entity name, if different from above [text, w9=2, prefill=business_name]
## Line 3 · Federal Tax Classification
3a. Federal tax classification of the person or entity on line 1 (check only one) * [choice: Individual/sole proprietor | C corporation | S corporation | Partnership | Trust/estate | LLC | Other, w9=3a] -- Most independent cleaners choose Individual/sole proprietor
LLC. Enter the tax classification * [choice: C - C corporation | S - S corporation | P - Partnership, w9=3a-llc, when=3a:LLC] -- A single-member LLC that is a disregarded entity should choose Individual/sole proprietor above instead
Other (see instructions) * [text, w9=3a-other, when=3a:Other]
3b. You checked Partnership, Trust/estate, or LLC with P, and you have foreign partners, owners, or beneficiaries [check, w9=3b] -- Leave unchecked if this doesn't apply to you
## Line 4 · Exemptions
4. Exempt payee code (if any) [text, w9=4-payee] -- Codes apply only to certain entities, not individuals. Most contractors leave this blank.
Exemption from FATCA reporting code (if any) [text, w9=4-fatca] -- Leave blank unless it applies to you
## Lines 5–7 · Address
5. Address (number, street, and apt. or suite no.) * [text, w9=5, prefill=address] -- Requester's name and address is filled in for you: Turnly LLC, 144 E King St STE 303, Hillsborough, NC 27278
6. City, state, and ZIP code * [text, w9=6, prefill=city_state_zip]
7. List account number(s) here (optional) [text, w9=7]
## Part I · Taxpayer Identification Number (TIN)
Which number are you entering? * [choice: Social security number (SSN) | Employer identification number (EIN), w9=tin-type] -- For individuals this is generally your SSN. Use your EIN if you file as a business.
Taxpayer identification number * [tin, sensitive, confirm, w9=tin] -- 9 digits. It must match the name on line 1.
## Part II · Certification
The IRS has notified me that I am currently subject to backup withholding because I failed to report all interest and dividends on my tax return [check, w9=backup] -- Only check this if the IRS told you so. It crosses out item 2 below.
Under penalties of perjury, I certify that: 1. The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and 2. I am not subject to backup withholding because (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and 3. I am a U.S. citizen or other U.S. person; and 4. The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct. * [check, w9=cert]
`;

const W9_DESCRIPTION =
  "Answer each numbered line just like the paper form, then sign. Turnly receives the official IRS Form W-9 filled in with your answers and your typed signature. Required before you can be paid.";

export const SEED_VERSION = "seed_v1";
/** Oct 2026 checklist update applied to the live checklist (see OnboardingHub.migrateChecklist). */
export const CHECKLIST_V2 = "checklist_v2";

export type ChecklistUpdate = { title: string; sort: number; kind?: SeedItem["kind"]; description?: string; questions?: string };

export const V2_UPDATES: ChecklistUpdate[] = [
  {
    title: "Contractor Intake & Authorization",
    sort: 0,
    description:
      "Start here. Your contact details, emergency contacts, availability, preferences, transportation, experience, and background check authorization. You only enter your contact details once; the other forms reuse them.",
    questions: INTAKE,
  },
  { title: "Master Contractor Agreement", sort: 1, questions: AGREEMENT_FIELDS },
  { title: "Independent Contractor Tax Information", sort: 2 },
  { title: "Form W-9", sort: 3, kind: "form", description: W9_DESCRIPTION, questions: W9_FIELDS },
  { title: "Direct Deposit Authorization", sort: 4, questions: DIRECT_DEPOSIT },
  { title: "Bank Verification", sort: 5 },
  { title: "General Liability Insurance (COI)", sort: 6 },
];

export const SEED_ITEMS: SeedItem[] = [
  {
    kind: "form",
    title: "Contractor Intake & Authorization",
    description: V2_UPDATES[0].description ?? "",
    questions: INTAKE,
    pdfUrl: `${ATTACHMENTS}/pxftio4o7h48t78l61m17.pdf`,
    pdfName: "Turnly_Contractor_Intake_Authorization_Form.pdf",
  },
  {
    kind: "sign",
    title: "Master Contractor Agreement",
    description:
      "Read the Turnly LLC Master Independent Contractor Services Agreement in full and sign with your typed legal name. Your contact details are filled in from your Contractor Information. Your signed copy is saved to your Turnly file.",
    questions: AGREEMENT_FIELDS,
    pdfUrl: `${ATTACHMENTS}/h6jbw196dc0oe49q8lguq.pdf`,
    pdfName: "Turnly_Master_Contractor_Agreement.pdf",
  },
  {
    kind: "sign",
    title: "Independent Contractor Tax Information",
    description:
      "Read how taxes work as an independent contractor (no withholding, possible 1099-NEC, self-employment and estimated taxes), then sign to acknowledge you received it. This is not tax advice.",
    pdfUrl: `${ATTACHMENTS}/o22rvp2xj92kmc000uonf.pdf`,
    pdfName: "Turnly_Independent_Contractor_Tax_Information_Sheet.pdf",
  },
  {
    kind: "form",
    title: "Form W-9",
    description: W9_DESCRIPTION,
    questions: W9_FIELDS,
    pdfUrl: `${ATTACHMENTS}/fymqzjvsdbqs0jfx1iw7d.pdf`,
    pdfName: "W-9 Form.pdf",
    requiresReview: true,
  },
  {
    kind: "form",
    title: "Direct Deposit Authorization",
    description:
      "Tell Turnly where to send your pay. Enter your bank details twice to avoid typos, then sign the authorization.",
    questions: DIRECT_DEPOSIT,
    pdfUrl: `${ATTACHMENTS}/5m2dhrss1hh6uyqkkit3y.pdf`,
    pdfName: "Turnly_Direct_Deposit_Authorization_Form.pdf",
  },
  {
    kind: "upload",
    title: "Bank Verification",
    description:
      "Upload ONE of the following for the account you entered: a voided check, a bank letter, or a direct deposit form from your bank.",
    requiresReview: true,
  },
  {
    kind: "upload",
    title: "General Liability Insurance (COI)",
    description:
      "Carry at least $1,000,000 in general liability coverage and upload your Certificate of Insurance (not a quote or receipt). List Turnly LLC, 144 E King St STE 303, Hillsborough, NC 27278 as certificate holder. Need a policy? Start a quote at nextinsurance.com. Open the guide below for step-by-step help.",
    pdfUrl: `${ATTACHMENTS}/xn6e4wj5iotum3qqrboad.pdf`,
    pdfName: "Turnly_Contractor_Insurance_Requirements.pdf",
    requiresExpiration: true,
    requiresReview: true,
  },
];

