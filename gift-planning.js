(() => {
  const money = cents => (cents / 100).toLocaleString('en-US', {style: 'currency', currency: 'USD'});
  async function request(action, data) {
    const response = await fetch('/api/gift-cards', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action, ...data}), signal: AbortSignal.timeout(15000)
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Please try again.');
    return value;
  }
  function setup(id, resultId, action, render) {
    const form = document.getElementById(id), result = document.getElementById(resultId);
    const button = form.querySelector('button[type="submit"]');
    let revision = 0;
    form.addEventListener('input', () => {
      revision++;
      result.textContent = 'Details changed. Check again for an updated result.';
      delete result.dataset.state;
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const current = ++revision;
      button.disabled = true;
      result.textContent = 'Checking…';
      delete result.dataset.state;
      try {
        const value = await request(action, Object.fromEntries(new FormData(form)));
        if (current !== revision) return;
        render(result, value);
      } catch (error) {
        if (current !== revision) return;
        result.dataset.state = 'error';
        result.textContent = error.name === 'TimeoutError' ? 'This check took too long. Please try again.' : error.message;
      } finally { button.disabled = false; }
    });
  }
  setup('giftCoverageForm', 'giftCoverageResult', 'coverage', (result, value) => {
    result.dataset.state = value.approved ? 'approved' : 'outside';
    result.textContent = value.approved
      ? `${value.matched_address}: In our ${value.service_city} service area. The recipient will choose an available date and confirm service details when booking.`
      : `${value.message} Please choose a recipient in an eligible area before purchasing.`;
  });
  setup('giftEstimateForm', 'giftEstimateResult', 'estimate', (result, value) => {
    result.dataset.state = 'estimate';
    result.replaceChildren();
    for (const [label, amount] of [['Estimated clean', value.amount_cents], ['One gift card', -10000], ['Recipient pays', value.remaining_cents]]) {
      const row = document.createElement('p'), title = document.createElement('span'), price = document.createElement('strong');
      row.className = 'estimate-line'; title.textContent = label; price.textContent = money(amount);
      row.append(title, price); result.append(row);
    }
    const note = document.createElement('p'); note.className = 'fine';
    note.textContent = value.review_required ? 'Homes over 3,000 sq ft require a custom review. This is a preliminary estimate; final pricing may change.' : 'Current one-time pricing. No booking or payment is made by this estimate.';
    if (value.pet_fee_cents) note.textContent += ` Includes the ${money(value.pet_fee_cents)} pet fee.`;
    result.append(note);
  });
})();
