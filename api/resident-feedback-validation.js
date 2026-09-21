const MAX_CARDS_PER_BATCH = 2000; // Four flyers per sheet, 500 sheets per ream.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function homeDetails(input) {
  const result = {};
  for (const [name,min,max,step] of [['bedrooms',0,30,1],['bathrooms',1,30,0.5],['square_feet',100,100000,1]]) {
    const value = input[name];
    if (value == null || value === '') { result[name] = null; continue; }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || value % step !== 0) throw new Error(`Enter a valid ${name.replace('_',' ')} value, or leave it blank.`);
    result[name] = value;
  }
  return result;
}

function validateResidentFeedbackRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Please check the feedback request.');
  const input = value;
  const action = String(input.action || '');
  if (!['create_batch', 'list_batches', 'delete_batch', 'update_batch_home', 'quote_context', 'resolve', 'submit'].includes(action)) throw new Error('Please check the feedback request.');
  if (action === 'update_batch_home') {
    if (!UUID.test(String(input.batch_id || ''))) throw new Error('Choose a saved batch.');
    return { action, batch_id: input.batch_id, ...homeDetails(input) };
  }
  if (action === 'list_batches') {
    const page = input.page ?? 1;
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new Error('Choose a valid batch page.');
    return { action, page };
  }
  if (action === 'delete_batch') {
    const batchId = String(input.batch_id || '');
    if (!UUID.test(batchId)) throw new Error('Choose a saved batch to delete.');
    if (input.confirm_delete !== true) throw new Error('Confirm deletion of this batch and its QR codes.');
    return { action, batch_id: batchId };
  }

  const token = input.token == null ? '' : String(input.token);
  if (['resolve','submit','quote_context'].includes(action) && !/^[a-f0-9]{64}$/.test(token)) throw new Error('This feedback link is not valid.');
  if (action === 'resolve' || action === 'quote_context') return { action, token };

  if (action === 'submit') {
    const message = input.message == null ? '' : input.message;
    const requestId = String(input.request_id || '');
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('Please choose a rating.');
    if (typeof message !== 'string' || message.trim().length > 2000) throw new Error('Please shorten your feedback to 2,000 characters.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error('Please reload the page and try again.');
    return { action, token, rating: input.rating, message: message.trim(), request_id: requestId, honeypot: String(input.honeypot || '').slice(0, 200) };
  }

  const propertyId = String(input.property_id || '');
  const propertyCode = String(input.property_code || '').trim().toUpperCase();
  const count = input.count;
  const start = input.start_number;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propertyId)) throw new Error('Choose a property.');
  if (!/^[A-Z0-9]{2,10}$/.test(propertyCode)) throw new Error('Use 2–10 letters or numbers for the property code.');
  if (!Number.isInteger(count) || count < 1 || count > MAX_CARDS_PER_BATCH) throw new Error(`Choose between 1 and ${MAX_CARDS_PER_BATCH} QR cards.`);
  if (!Number.isInteger(start) || start < 1 || start > 999999 || start + count - 1 > 999999) throw new Error('Choose a starting card number that fits within six digits.');
  return { action, property_id: propertyId, property_code: propertyCode, count, start_number: start,
    ...(Object.keys(input).some(key => ['bedrooms','bathrooms','square_feet'].includes(key)) ? homeDetails(input) : {}) };
}

function residentFeedbackErrorMessage(value) {
  const text = String(value || '');
  if (text.includes('invalid_feedback_card')) return 'This QR card is no longer active. Please ask your property team for a new card.';
  if (text.includes('feedback_rate_limited')) return 'This card was just used. Please wait a moment before trying again.';
  if (text.includes('resident_feedback_cards_property_code_card_number')) return 'Those card numbers already exist for this property code. Choose a different starting number.';
  if (text.includes('invalid_feedback_rating')) return 'Please choose a rating from 1 to 5.';
  if (text.includes('feedback_message_too_long')) return 'Please shorten your feedback to 2,000 characters.';
  return 'The feedback service could not complete that request. Please try again.';
}

module.exports = { MAX_CARDS_PER_BATCH, residentFeedbackErrorMessage, validateResidentFeedbackRequest };
