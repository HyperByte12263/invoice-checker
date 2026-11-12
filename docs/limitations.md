# Limitations: what the rules do and do not check

This project is tested on 50 **synthetic** invoices. The rules in `src/rules.js` are written for that
test set. Real invoices bring cases the rules do not cover. This list feeds the README's
"What it gets wrong" section.

## Covered by the rules
- Each line: quantity x unit price equals the printed line amount (0.01 tolerance)
- Line amounts add up to the subtotal (0.01 tolerance)
- Tax equals the configured rate of the subtotal (default 6%, 0.01 tolerance)
- Subtotal plus tax equals the total (0.01 tolerance)
- Invoice number present and in the form `INV-` followed by digits
- Date is a real `YYYY-MM-DD` date and not in the future
- No required field is missing
- Duplicates: the same vendor already has this invoice number approved. Matching ignores case,
  spaces, hyphens and punctuation, so `INV-1000` and `inv 1000` are treated as the same number.
  A different vendor using the same number is allowed, because suppliers number their invoices
  independently.

## Known limits
- **One flat tax rate.** Real tax rules vary by country, product and supplier. Some suppliers
  charge no tax, and some invoices mix rates. The rate is a single `taxRate` option. Multi-rate
  and zero-rated lines are not supported.
- **Rounding method.** Tax rounded line by line can legitimately differ from tax on the subtotal
  by 1 to 2 cents. With the 0.01 tolerance, such invoices may be flagged for review.
- **Invoice number format.** `INV-` plus digits matches the synthetic vendors only. Real vendors
  each use their own format.
- **Duplicates.** Only invoices already in the Approved sheet are checked. Near-misses beyond
  formatting (typos such as `INV-1001` vs `INV-1010`, or the same amount and date under a new
  number) are not detected.
- **Dates.** Only `YYYY-MM-DD` is accepted. The AI is asked to convert dates to this format. A
  very old date (for example a typo of 2016 for 2026) is not flagged.
- **Vendor.** Only checked for presence. It is not matched against a list of approved suppliers.

## Out of scope
- Purchase order and goods-received matching (2-way and 3-way match)
- Tax registration numbers and country-specific tax-invoice rules
- E-invoicing systems and their validation IDs
- Discounts, shipping lines, deposits, credit notes, negative amounts
- Multiple currencies
- Multi-page and scanned (image-only) invoices, which would need OCR

## Background reading
- Duplicate invoices and number-format variants: [Basware](https://blog.basware.com/en/the-5-top-reasons-for-duplicate-invoicing-and-eliminating-the-risks),
  [HighRadius](https://www.highradius.com/resources/Blog/duplicate-payments/),
  [Corpay](https://www.corpay.com/it/resources/blog/duplicate-payment-detection)
- Common accounts-payable errors: [Fiscaltec](https://fiscaltec.com/what-we-learnt-from-years-of-ap-recovery-audits/),
  [Perk](https://www.perk.com/blog/invoice-errors/)
- Tax rounding differences: [Cliniko](https://help.cliniko.com/en/articles/13524560-why-invoice-totals-can-differ-by-1-cent),
  [Perk](https://support.perk.com/hc/en-us/articles/22004113167516-Optimized-tax-rounding-in-invoice-line-items)
