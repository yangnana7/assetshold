// Numeric helpers used across server and services

// Floor to 2 decimal places (no integer rounding)
function round2Floor(x) {
  return Math.floor(Number(x) * 100) / 100;
}

// Convert a value to integer JPY after flooring to 2 decimals then rounding to nearest yen
// Equivalent to previous `floor2` in bookval.js
function intYenFloorFrom2Decimals(x) {
  return Math.round(round2Floor(x));
}

module.exports = {
  round2Floor,
  intYenFloorFrom2Decimals,
};

