import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { residentFeedbackErrorMessage, validateResidentFeedbackRequest } = require('../api/resident-feedback-validation.js');

const propertyId = '9f2b20d0-906c-4bb5-a42c-89bb5f505c84';
const requestId = 'df27d778-e05f-4a42-8d9c-4fc9454db94d';
const token = 'a'.repeat(64);

test('accepts bounded QR batches and normalizes the property code', () => {
  assert.deepEqual(validateResidentFeedbackRequest({ action: 'create_batch', property_id: propertyId, property_code: 'vfh', count: 100, start_number: 1 }), {
    action: 'create_batch', property_id: propertyId, property_code: 'VFH', count: 100, start_number: 1
  });
});

test('rejects invalid batch sizes and ranges', () => {
  assert.throws(() => validateResidentFeedbackRequest({ action: 'create_batch', property_id: propertyId, property_code: 'VFH', count: 501, start_number: 1 }), /between 1 and 500/);
  assert.throws(() => validateResidentFeedbackRequest({ action: 'create_batch', property_id: propertyId, property_code: 'VFH', count: 5, start_number: 999999 }), /starting card number/);
});

test('accepts resident ratings without requiring personal or property details', () => {
  assert.deepEqual(validateResidentFeedbackRequest({ action: 'submit', token, request_id: requestId, rating: 5, message: 'Very clean' }), {
    action: 'submit', token, request_id: requestId, rating: 5, message: 'Very clean', honeypot: ''
  });
});

test('rejects malformed tokens, ratings, and oversized messages', () => {
  assert.throws(() => validateResidentFeedbackRequest({ action: 'resolve', token: 'guess' }), /not valid/);
  assert.throws(() => validateResidentFeedbackRequest({ action: 'submit', token, request_id: requestId, rating: 0 }), /choose a rating/);
  assert.throws(() => validateResidentFeedbackRequest({ action: 'submit', token, request_id: requestId, rating: 5, message: 'x'.repeat(2001) }), /2,000 characters/);
});

test('maps database conflicts to actionable feedback', () => {
  assert.match(residentFeedbackErrorMessage('resident_feedback_cards_property_code_card_number_key'), /already exist/);
  assert.match(residentFeedbackErrorMessage('invalid_feedback_card'), /no longer active/);
});
