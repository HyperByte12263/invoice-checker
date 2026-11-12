// Unit tests for src/rules.js. Run with: node --test
// All data is synthetic.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkInvoice } = require('../src/rules.js');

const TODAY = '2026-11-02';
const OPTS = { approved: [], today: TODAY };

// A clean invoice: 136 + 25 + 75 + 125 = 361.00, tax 21.66, total 382.66
function clean(overrides = {}) {
  return {
    vendor: 'Demo Office Mart',
    invoice_no: 'INV-1000',
    date: '2026-01-14',
    lines: [
      { description: 'Desk lamp', qty: 2, unit_price: 68.0, amount: 136.0 },
      { description: 'A4 paper (ream)', qty: 2, unit_price: 12.5, amount: 25.0 },
      { description: 'Courier fee', qty: 5, unit_price: 15.0, amount: 75.0 },
      { description: 'USB-C cable', qty: 5, unit_price: 25.0, amount: 125.0 },
    ],
    subtotal: 361.0,
    tax: 21.66,
    total: 382.66,
    ...overrides,
  };
}
const withApproved = (approved, extra = {}) => ({ ...OPTS, approved, ...extra });

function expectPass(inv, opts = OPTS) {
  const r = checkInvoice(inv, opts);
  assert.deepEqual(r, { flagged: false, reasons: [] });
}

function expectFlag(inv, pattern, opts = OPTS) {
  const r = checkInvoice(inv, opts);
  assert.equal(r.flagged, true, 'expected the invoice to be flagged');
  assert.ok(r.reasons.some((x) => pattern.test(x)), `no reason matched ${pattern}: ${JSON.stringify(r.reasons)}`);
}

test('clean invoice passes', () => expectPass(clean()));

// --- each line: qty x unit price = amount ---
test('line: amount that does not match qty x unit price is flagged', () => {
  const inv = clean();
  inv.lines[0].amount = 163.0; // transposed digits; subtotal still matches the printed amounts below
  inv.subtotal = 388.0; inv.tax = 23.28; inv.total = 411.28;
  expectFlag(inv, /Line 1 \(Desk lamp\): 2 x 68\.00 = 136\.00, but amount is 163\.00/);
});
test('line: subtotal is checked against the printed amounts, so a bad line gives exactly one reason', () => {
  const inv = clean();
  inv.lines[0].amount = 163.0;
  inv.subtotal = 388.0; inv.tax = 23.28; inv.total = 411.28;
  const r = checkInvoice(inv, OPTS);
  assert.deepEqual(r.reasons, ['Line 1 (Desk lamp): 2 x 68.00 = 136.00, but amount is 163.00']);
});
test('line: 0.01 difference is tolerated', () => {
  const inv = clean();
  inv.lines[0].amount = 136.01;
  inv.subtotal = 361.01; inv.total = 382.67;
  expectPass(inv);
});
test('line: a line with null qty is flagged', () => {
  const inv = clean();
  inv.lines[0].qty = null;
  expectFlag(inv, /missing its quantity, unit price or amount/);
});
test('line: a line with no amount is flagged', () => {
  const inv = clean();
  delete inv.lines[2].amount;
  expectFlag(inv, /missing its quantity, unit price or amount/);
});

// --- line amounts sum to subtotal ---
test('lines: sum mismatch is flagged', () =>
  expectFlag(clean({ subtotal: 371.0, tax: 22.26, total: 393.26 }), /Line amounts add up to 361\.00/));
test('lines: 0.01 difference is tolerated', () =>
  expectPass(clean({ subtotal: 361.01, tax: 21.66, total: 382.67 })));

// --- tax rate ---
test('tax: wrong tax is flagged', () =>
  expectFlag(clean({ tax: 25.66, total: 386.66 }), /Tax 25\.66 is not 6% of subtotal 361\.00/));
test('tax: 0.01 difference is tolerated', () => expectPass(clean({ tax: 21.67, total: 382.67 })));
test('tax: 0.02 difference is flagged', () => expectFlag(clean({ tax: 21.68, total: 382.68 }), /not 6%/));
test('tax: an 8% invoice passes when taxRate is set to 8%', () =>
  expectPass(clean({ tax: 28.88, total: 389.88 }), { ...OPTS, taxRate: 0.08 }));
test('tax: an 8% invoice is flagged under the default 6% and the reason names the rate', () =>
  expectFlag(clean({ tax: 28.88, total: 389.88 }), /not 6% of subtotal/));
test('tax: a zero-tax invoice passes when taxRate is 0', () =>
  expectPass(clean({ tax: 0, total: 361.0 }), { ...OPTS, taxRate: 0 }));
test('tax: reason shows a fractional rate cleanly', () =>
  expectFlag(clean(), /not 7\.5% of subtotal/, { ...OPTS, taxRate: 0.075 }));

// --- subtotal + tax = total ---
test('total: wrong total is flagged', () => expectFlag(clean({ total: 392.66 }), /but total is 392\.66/));
test('total: 0.01 difference is tolerated', () => expectPass(clean({ total: 382.67 })));
test('total: 0.02 difference is flagged', () => expectFlag(clean({ total: 382.68 }), /Subtotal \+ tax/));
test('money: floating-point noise does not cause a flag', () =>
  expectPass(clean({ lines: [{ description: 'x', qty: 3, unit_price: 0.1, amount: 0.3 }], subtotal: 0.3, tax: 0.02, total: 0.32 })));

// --- invoice number format ---
test('number: null is flagged as missing', () => expectFlag(clean({ invoice_no: null }), /Missing field: invoice_no/));
test('number: empty string is flagged as missing', () => expectFlag(clean({ invoice_no: '' }), /Missing field: invoice_no/));
for (const bad of ['INV-', 'inv-1000', 'INV-12A', 'INV 1000', '1000']) {
  test(`number: "${bad}" is flagged as bad format`, () => expectFlag(clean({ invoice_no: bad }), /does not match INV-/));
}
test('number: surrounding spaces are ignored', () => expectPass(clean({ invoice_no: ' INV-1000 ' })));

// --- date ---
test('date: impossible month/day is flagged', () => expectFlag(clean({ date: '2026-13-45' }), /not a real date/));
test('date: 30 February is flagged', () => expectFlag(clean({ date: '2026-02-30' }), /not a real date/));
test('date: non-ISO format is flagged', () => expectFlag(clean({ date: '14/01/2026' }), /not a real date/));
test('date: leap day in a leap year passes', () => expectPass(clean({ date: '2024-02-29' })));
test('date: future date is flagged', () => expectFlag(clean({ date: '2026-11-03' }), /in the future/));
test('date: today passes', () => expectPass(clean({ date: TODAY })));

// --- required fields ---
for (const key of ['vendor', 'invoice_no', 'date', 'lines', 'subtotal', 'tax', 'total']) {
  test(`required: null ${key} is flagged as missing`, () =>
    expectFlag(clean({ [key]: null }), new RegExp(`Missing field: ${key}`)));
}
test('required: empty lines array is flagged as missing', () => expectFlag(clean({ lines: [] }), /Missing field: lines/));
test('required: a number given as text is flagged', () => expectFlag(clean({ total: '382.66' }), /Not a number: total/));

// --- duplicates: same vendor + same invoice number ---
const DEMO_1000 = { vendor: 'Demo Office Mart', invoice_no: 'INV-1000' };
test('duplicate: same vendor and number already approved is flagged', () =>
  expectFlag(clean(), /Duplicate: Demo Office Mart invoice INV-1000 is already approved/, withApproved([DEMO_1000])));
test('duplicate: a different vendor using the same number passes', () =>
  expectPass(clean({ vendor: 'Example Supplies Co.' }), withApproved([DEMO_1000])));
test('duplicate: same vendor with a different number passes', () =>
  expectPass(clean({ invoice_no: 'INV-1001' }), withApproved([DEMO_1000])));
test('duplicate: nothing approved yet passes', () => expectPass(clean(), withApproved([])));
for (const variant of ['INV1000', 'inv-1000', 'INV 1000', 'INV-10-00']) {
  test(`duplicate: number written as "${variant}" still matches`, () =>
    expectFlag(clean({ invoice_no: variant }), /Duplicate:/, withApproved([DEMO_1000])));
}
for (const vendor of ['DEMO OFFICE MART', 'Demo Office Mart.', ' demo  office mart ']) {
  test(`duplicate: vendor written as "${vendor}" still matches`, () =>
    expectFlag(clean({ vendor }), /Duplicate:/, withApproved([DEMO_1000])));
}
test('duplicate: no check when the vendor is missing (flagged as missing instead)', () => {
  const r = checkInvoice(clean({ vendor: null }), withApproved([DEMO_1000]));
  assert.deepEqual(r.reasons, ['Missing field: vendor']);
});

// --- general behaviour ---
test('several problems give several reasons', () => {
  const r = checkInvoice(clean({ invoice_no: null, date: '2026-13-45', total: 400 }), OPTS);
  assert.equal(r.flagged, true);
  assert.equal(r.reasons.length, 3, JSON.stringify(r.reasons));
});
test('missing fields do not also produce confusing maths reasons', () => {
  const r = checkInvoice(clean({ subtotal: null }), OPTS);
  assert.deepEqual(r.reasons, ['Missing field: subtotal']);
});
test('does not modify the input', () => {
  const inv = clean();
  const copy = structuredClone(inv);
  checkInvoice(inv, withApproved([DEMO_1000]));
  assert.deepEqual(inv, copy);
});
test('works with no options (defaults to today, 6% and nothing approved)', () => {
  assert.deepEqual(checkInvoice(clean()), { flagged: false, reasons: [] });
});
