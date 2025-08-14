exports.REQUIRED_HEADERS = [
  'class','name','note','acquired_at','book_value_jpy',
  'valuation_source','liquidity_tier','tags',
  // optional/conditional
  'ticker','exchange','metal','weight_g','purity',
  'address','lot','unit','quantity'
];

exports.ALLOWED_CLASS = ['us_stock','jp_stock','precious_metal','watch','collection','real_estate','cash'];

exports.isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

exports.normalizeMoney = (s) => {
  if (typeof s === 'number') return s;
  if (!s) return 0;
  const n = String(s).replace(/[,_\s￥¥$,]/g,'').trim();
  const v = Number(n);
  if (!Number.isFinite(v)) throw new Error('invalid money');
  return v;
};

exports.assertEnum = (v, list) => {
  if (!list.includes(v)) throw new Error('invalid enum: ' + v);
  return v;
};