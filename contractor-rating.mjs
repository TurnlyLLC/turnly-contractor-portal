const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {unrated:'Awaiting first review',building:'Building your rating',good:'Meeting the standard',watch:'Watch your trend',review:'Turnly review needed',paused:'New claims paused'};
export function ratingPanel(rating) {
  if (!rating) return '<p>Your rating could not load. Refresh to try again.</p>';
  const score = rating.average == null ? 'No rating yet' : Number(rating.average).toFixed(2) + ' / 5 ★';
  return `<div class="cp-mini-list"><div class="cp-mini-row"><strong>${score}</strong><span>${labels[rating.status]}</span></div><p>${rating.count} rated customer${rating.count===1?'':'s'} · Target 4.30 / 5</p><p>We use the latest contractor rating from each of your last 50 rated customers across residential and commercial cleans. A job without a review has no effect.</p><p>Turnly reviews scores below 4.30 once at least 10 customers have rated you and at least three gave 4 stars or fewer. New claims pause only after an admin reviews the circumstances.</p>${rating.status==='paused'?`<p><strong>Reason for pause</strong> ${escape(rating.note)}</p>`:''}<p>Was a rating about scheduling, an excluded task, or another issue outside your control? Give Turnly the booking reference in <a href="mailto:admin@turnlypros.com">a review request</a>.</p></div>`;
}
export function adminRatingPanel(data) {
  return `<h3>Contractor performance</h3>${ratingPanel(data.rating)}
    ${data.rating.status==='review'?'<button data-rating-decision="pause">Pause new claims after review</button>':''}
    ${data.last_decision==='pause'?'<button data-rating-decision="restore">Restore new claims</button>':''}
    <h3>Rated cleans</h3>${data.reviews.map(r=>`<section class="cc-details"><div><strong>${escape(r.created_at.slice(0,10))} · ${r.contractor_rating}/5 ★</strong><p>${escape(r.channel)} · Job ${escape(r.booking_id)}</p><p>${escape(r.comments||'No written comments.')}</p>${r.rating_exclusion_reason?`<p>Excluded · ${escape(r.rating_exclusion_reason)}</p>`:''}<button data-rating-booking="${r.booking_id}" data-rating-decision="${r.rating_exclusion_reason?'include':'exclude'}">${r.rating_exclusion_reason?'Include rating again':'Exclude from score'}</button></div></section>`).join('')||'<p>No rated cleans yet.</p>'}`;
}
