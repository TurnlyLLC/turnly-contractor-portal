function excessCents({available, obligations, fees, pending, reserve}) {
  const amounts = [available, obligations, fees, pending, reserve];
  if (!amounts.every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw Error('A complete balance and obligations snapshot is required');
  }
  return Math.max(0, available - obligations - fees - pending - reserve);
}
module.exports = {excessCents};
