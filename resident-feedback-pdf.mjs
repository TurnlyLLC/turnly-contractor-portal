// Artwork extracted without alteration from the supplied Turnly Letter flyer.
// All positions below are in the original 1054 x 1492 artwork coordinates.
export const ARTWORK_URL = '/assets/turnly-feedback-flyer.png?v=20260918-flyer';
export const RESIDENTIAL_URL = 'https://turnlypros.com/residential/';
const WIDTH = 1054;
const HEIGHT = 1492;
const MAIN_QR = { x: 144, y: 514, size: 378 };
const HOME_QR = { x: 757, y: 1119, size: 138 };
const FOOTER = { x: 345, y: 1390, width: 363, height: 62 };
const CARD_WIDTH = 270;
const CARD_HEIGHT = CARD_WIDTH * HEIGHT / WIDTH;
const SCALE = CARD_WIDTH / WIDTH;
let artworkPromise;

export const cardId = (code, number) => `${code}-${String(number).padStart(3, '0')}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export async function loadFlyerArtwork() {
  if (!artworkPromise) {
    artworkPromise = fetch(ARTWORK_URL).then(async response => {
      if (!response.ok) throw new Error('The flyer artwork could not load. Retry the PDF download.');
      return new Uint8Array(await response.arrayBuffer());
    }).catch(error => { artworkPromise = null; throw error; });
  }
  return artworkPromise;
}

function qrMatrix(url) {
  if (typeof globalThis.qrcode !== 'function') throw new Error('The QR generator could not load. Refresh and try again.');
  const qr = globalThis.qrcode(0, 'M');
  qr.addData(url, 'Byte');
  qr.make();
  return qr;
}

function qrPath(qr) {
  const size = qr.getModuleCount();
  const runs = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size;) {
      if (!qr.isDark(row, col)) { col++; continue; }
      const start = col;
      while (col < size && qr.isDark(row, col)) col++;
      runs.push(`M${start + 4} ${row + 4}h${col - start}v1h-${col - start}z`);
    }
  }
  return runs.join('');
}

function qrSvg(url, box) {
  const qr = qrMatrix(url);
  const size = qr.getModuleCount() + 8; // Four clear modules on every side.
  return `<svg x="${box.x}" y="${box.y}" width="${box.size}" height="${box.size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="white"/><path d="${qrPath(qr)}" fill="black" shape-rendering="crispEdges"/></svg>`;
}

// Render only the changing label as a high-resolution image. This keeps names
// with accents/non-Latin characters intact without embedding a large font.
function footerDataUrl(propertyName, propertyCode, number) {
  const canvas = document.createElement('canvas');
  canvas.width = FOOTER.width * 2;
  canvas.height = FOOTER.height * 2;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser cannot render the flyer label. Try another browser.');
  context.scale(2, 2);
  context.fillStyle = '#00121d';
  context.fillRect(0, 0, FOOTER.width, FOOTER.height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const label = `PROPERTY: ${String(propertyName).toUpperCase()}`;
  let size = 15;
  context.font = `700 ${size}px Arial, sans-serif`;
  while (context.measureText(label).width > FOOTER.width - 16 && size > 10) {
    size -= 0.25;
    context.font = `700 ${size}px Arial, sans-serif`;
  }
  context.fillStyle = '#00eff5';
  context.fillText(label, FOOTER.width / 2, 19, FOOTER.width - 16);
  context.font = '14px Arial, sans-serif';
  context.fillStyle = '#ffffff';
  context.fillText(`TURNLY FEEDBACK  ·  ${cardId(propertyCode, number)}`, FOOTER.width / 2, 48, FOOTER.width - 16);
  return canvas.toDataURL('image/png');
}

export function flyerSvg(card, propertyName, propertyCode, { preview = false } = {}) {
  const id = cardId(propertyCode, card.card_number);
  const main = preview
    ? `<rect x="${MAIN_QR.x}" y="${MAIN_QR.y}" width="${MAIN_QR.size}" height="${MAIN_QR.size}" fill="white"/><text x="333" y="678" text-anchor="middle" font-family="Arial" font-size="26" font-weight="bold" fill="#002638">YOUR UNIQUE QR</text><text x="333" y="722" text-anchor="middle" font-family="Arial" font-size="22" fill="#002638">Generated with your batch</text>`
    : qrSvg(card.feedback_url, MAIN_QR);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${esc(preview ? 'Flyer design preview' : `Feedback flyer ${id} for ${propertyName}`)}"><image href="${ARTWORK_URL}" width="${WIDTH}" height="${HEIGHT}"/>${main}${qrSvg(RESIDENTIAL_URL, HOME_QR)}<image href="${footerDataUrl(propertyName, propertyCode, card.card_number)}" x="${FOOTER.x}" y="${FOOTER.y}" width="${FOOTER.width}" height="${FOOTER.height}"/></svg>`;
}

function validateBatch(cards, propertyName, propertyCode) {
  if (!Array.isArray(cards) || !cards.length || cards.length > 2000) throw new Error('Generate between 1 and 2,000 flyers first.');
  if (!String(propertyName || '').trim() || !/^[A-Z0-9]{2,10}$/.test(propertyCode)) throw new Error('The batch is missing its property details.');
  const numbers = new Set();
  const links = new Set();
  for (const card of cards) {
    if (!Number.isInteger(card.card_number) || card.card_number < 1 || card.card_number > 999999
      || !/^https:\/\/turnlypros\.com\/f\/[a-f0-9]{64}$/.test(card.feedback_url || '')) throw new Error('A flyer is missing its saved feedback link or card number.');
    if (numbers.has(card.card_number) || links.has(card.feedback_url)) throw new Error('Each flyer must have its own card number and feedback link.');
    numbers.add(card.card_number);
    links.add(card.feedback_url);
  }
}

function drawQr(page, qr, box, x, y, rgb) {
  const unit = box.size * SCALE / (qr.getModuleCount() + 8);
  const left = x + box.x * SCALE;
  const bottom = y + (HEIGHT - box.y - box.size) * SCALE;
  page.drawRectangle({ x: left, y: bottom, width: box.size * SCALE, height: box.size * SCALE, color: rgb(1, 1, 1) });
  for (let row = 0; row < qr.getModuleCount(); row++) {
    for (let col = 0; col < qr.getModuleCount();) {
      if (!qr.isDark(row, col)) { col++; continue; }
      const start = col;
      while (col < qr.getModuleCount() && qr.isDark(row, col)) col++;
      page.drawRectangle({ x: left + (start + 4) * unit, y: bottom + (qr.getModuleCount() + 3 - row) * unit,
        width: (col - start) * unit, height: unit, color: rgb(0, 0, 0) });
    }
  }
}

export async function buildFlyerPdf({ cards, propertyName, propertyCode, onProgress = () => {} }) {
  validateBatch(cards, propertyName, propertyCode);
  if (!globalThis.PDFLib) throw new Error('The PDF generator could not load. Refresh and try again.');
  const { PDFDocument, rgb } = globalThis.PDFLib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Turnly feedback flyers - ${propertyName}`);
  pdf.setAuthor('Turnly');
  pdf.setSubject(`${propertyCode}: ${cards.length} unique feedback flyers, four per US Letter page`);
  const artwork = await pdf.embedPng(await loadFlyerArtwork());
  const homeQr = qrMatrix(RESIDENTIAL_URL);
  let page;
  for (let index = 0; index < cards.length; index++) {
    if (index % 4 === 0) {
      page = pdf.addPage([612, 792]);
      page.drawLine({ start: { x: 306, y: 7.2 }, end: { x: 306, y: 784.8 }, thickness: 0.25, color: rgb(.72, .72, .72), dashArray: [2, 2] });
      page.drawLine({ start: { x: 7.2, y: 396 }, end: { x: 604.8, y: 396 }, thickness: 0.25, color: rgb(.72, .72, .72), dashArray: [2, 2] });
    }
    const card = cards[index];
    const x = index % 2 === 0 ? 31.68 : 310.32;
    const y = index % 4 < 2 ? 400.32 : 396 - 4.32 - CARD_HEIGHT;
    page.drawImage(artwork, { x, y, width: CARD_WIDTH, height: CARD_HEIGHT });
    drawQr(page, qrMatrix(card.feedback_url), MAIN_QR, x, y, rgb);
    drawQr(page, homeQr, HOME_QR, x, y, rgb);
    const footer = await pdf.embedPng(footerDataUrl(propertyName, propertyCode, card.card_number));
    page.drawImage(footer, { x: x + FOOTER.x * SCALE, y: y + (HEIGHT - FOOTER.y - FOOTER.height) * SCALE,
      width: FOOTER.width * SCALE, height: FOOTER.height * SCALE });
    onProgress(index + 1, cards.length);
    if (index % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return pdf.save();
}
