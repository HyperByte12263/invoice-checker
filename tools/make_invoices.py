"""Generate 50 synthetic PDF invoices with 10 planted errors, plus data/ground_truth.csv.

All names, companies, addresses and amounts are made up. Run from anywhere:
    .venv/Scripts/python tools/make_invoices.py
"""
import csv, datetime, random
from pathlib import Path
from fpdf import FPDF  # pip install fpdf2
from fpdf.fonts import FontFace

random.seed(42)
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'invoices'
GROUND_TRUTH = ROOT / 'data' / 'ground_truth.csv'
# Names, streets and towns use words like "Example" and "Sample" so they are obviously fictional.
# Emails use the reserved .example domain so they can never reach anyone.
VENDORS = ['Example Supplies Co.', 'Sample Tech Resources', 'Placeholder Logistics',
           'Mock Print Works', 'Demo Office Mart']
VENDOR_ADDRESS = {
    'Example Supplies Co.': ['Unit 8, 120 Example Street', 'Sampleton, EX 10001', 'accounts@example-supplies.example'],
    'Sample Tech Resources': ['Suite 302, Sample Tower', '5 Test Avenue, Demoville, EX 20450', 'billing@sampletech.example'],
    'Placeholder Logistics': ['Lot 21, Mock Industrial Park', 'Fictional Road, Placeholder City, EX 41200', 'finance@placeholder-logistics.example'],
    'Mock Print Works': ['17 Prototype Lane', 'Exampleton, EX 47300', 'invoices@mockprint.example'],
    'Demo Office Mart': ['Shop G-05, Sample Plaza', '1 Fiction Boulevard, Testford, EX 81200', 'ar@demooffice.example'],
}
CUSTOMERS = [
    ['Fictional Bean Cafe', '22 Example Street', 'Sampleton, EX 10007'],
    ['Sample Design Studio', 'Level 2, Mock House', 'Demoville, EX 20200'],
    ['Placeholder Bakery', '5 Sample Lane', 'Testford, EX 30250'],
    ['Demo Tutoring Center', '9 Test Avenue', 'Exampleton, EX 70200'],
]
CURRENCY = '$'
ITEMS = [('A4 paper (ream)', 12.50), ('Toner cartridge', 180.00), ('USB-C cable', 25.00),
         ('Desk lamp', 68.00), ('Courier fee', 15.00)]
TAX_RATE = 0.06  # fictional flat tax rate
ERRORS = ['wrong_total', 'wrong_tax', 'missing_number', 'duplicate_number', 'bad_date']
PER_ERROR = 2  # 5 error types x 2 = 10 planted errors

def build(i, error, original_vendor=None):
    inv_no = f'INV-{1000 + i}'
    if error == 'duplicate_number':
        inv_no = 'INV-1000'
    lines = [(n, p, random.randint(1, 6)) for n, p in random.sample(ITEMS, random.randint(2, 4))]
    subtotal = round(sum(p * q for _, p, q in lines), 2)
    tax = round(subtotal * TAX_RATE, 2)
    total = round(subtotal + tax, 2)
    date = (datetime.date(2026, 1, 1) + datetime.timedelta(days=random.randint(0, 300))).isoformat()
    if error == 'wrong_total':
        total = round(total + random.choice([5, 10, 25]), 2)
    if error == 'wrong_tax':
        tax = round(tax + random.choice([2, 4]), 2)
        total = round(subtotal + tax, 2)
    if error == 'missing_number':
        inv_no = ''
    if error == 'bad_date':
        date = '2026-13-45'
    vendor = random.choice(VENDORS)
    if error == 'duplicate_number':
        # A real duplicate is the same supplier reusing a number; other suppliers may legitimately use INV-1000.
        vendor = original_vendor
    return dict(inv_no=inv_no, vendor=vendor, date=date,
                lines=lines, subtotal=subtotal, tax=tax, total=total)

def write_pdf(path, d, customer):
    pdf = FPDF()
    pdf.add_page()
    # Header: vendor on the left, INVOICE title on the right
    pdf.set_font('Helvetica', 'B', 16)
    pdf.cell(120, 9, d['vendor'])
    pdf.set_font('Helvetica', 'B', 22)
    pdf.set_text_color(40, 70, 120)
    pdf.cell(0, 9, 'INVOICE', align='R', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', size=9)
    pdf.set_text_color(90, 90, 90)
    for line in VENDOR_ADDRESS[d['vendor']]:
        pdf.cell(0, 5, line, new_x='LMARGIN', new_y='NEXT')
    pdf.set_text_color(0, 0, 0)
    pdf.ln(10)
    # Bill to (left) and invoice details (right)
    top = pdf.get_y()
    pdf.set_font('Helvetica', 'B', 10)
    pdf.cell(0, 6, 'Bill to', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', size=10)
    for line in customer:
        pdf.cell(0, 5, line, new_x='LMARGIN', new_y='NEXT')
    bottom = pdf.get_y()
    pdf.set_y(top)
    for label, value in [('Invoice No:', d['inv_no']), ('Date:', d['date']), ('Terms:', 'Net 30')]:
        pdf.set_x(125)
        pdf.set_font('Helvetica', 'B', 10)
        pdf.cell(28, 6, label)
        pdf.set_font('Helvetica', size=10)
        pdf.cell(0, 6, value, new_x='LMARGIN', new_y='NEXT')
    pdf.set_y(max(bottom, pdf.get_y()) + 10)
    # Line items table
    pdf.set_font('Helvetica', size=10)
    with pdf.table(col_widths=(90, 20, 40, 40), borders_layout='HORIZONTAL_LINES', line_height=8,
                   headings_style=FontFace(emphasis='B', fill_color=(225, 232, 243))) as table:
        row = table.row()
        for heading, align in [('Description', 'L'), ('Qty', 'R'), (f'Unit price ({CURRENCY})', 'R'),
                               (f'Amount ({CURRENCY})', 'R')]:
            row.cell(heading, align=align)
        for name, price, qty in d['lines']:
            row = table.row()
            row.cell(name, align='L')
            row.cell(str(qty), align='R')
            row.cell(f'{price:.2f}', align='R')
            row.cell(f'{price * qty:.2f}', align='R')
    # Totals block, right-aligned under the Amount column
    pdf.ln(4)
    for label, key, bold in [('Subtotal', 'subtotal', False), (f'Tax ({TAX_RATE:.0%})', 'tax', False),
                             (f'Total ({CURRENCY})', 'total', True)]:
        pdf.set_x(115)
        pdf.set_font('Helvetica', 'B' if bold else '', 11 if bold else 10)
        border = 'T' if bold else 0
        pdf.cell(45, 8, label, border=border)
        pdf.cell(0, 8, f'{d[key]:.2f}', border=border, align='R', new_x='LMARGIN', new_y='NEXT')
    # Footer
    pdf.set_y(-45)
    pdf.set_font('Helvetica', size=9)
    pdf.set_text_color(90, 90, 90)
    pdf.cell(0, 5, 'Payment due within 30 days of the invoice date. Please quote the invoice number with payment.',
             new_x='LMARGIN', new_y='NEXT')
    pdf.cell(0, 5, 'Thank you for your business.', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(4)
    pdf.set_font('Helvetica', 'I', 8)
    pdf.cell(0, 5, 'SYNTHETIC TEST INVOICE - generated for a portfolio project. Not a real document.', align='C')
    pdf.output(str(path))

def main():
    n = 50
    OUT.mkdir(exist_ok=True)
    GROUND_TRUTH.parent.mkdir(exist_ok=True)
    # Invoice 0 is never picked, so it stays clean and a later duplicate of INV-1000 can be caught.
    picked = random.sample(range(1, n), len(ERRORS) * PER_ERROR)
    plan = {i: ERRORS[k // PER_ERROR] for k, i in enumerate(picked)}
    rows = []
    original_vendor = None
    for i in range(n):
        error = plan.get(i, '')
        d = build(i, error, original_vendor)
        if i == 0:
            original_vendor = d['vendor']
        name = f'invoice_{i:03d}.pdf'
        # Separate random stream, so adding customers does not change any invoice amounts or errors.
        customer = random.Random(1000 + i).choice(CUSTOMERS)
        write_pdf(OUT / name, d, customer)
        rows.append({'file': name, 'vendor': d['vendor'], 'invoice_no': d['inv_no'], 'date': d['date'],
                     'subtotal': d['subtotal'], 'tax': d['tax'], 'total': d['total'], 'planted_error': error})
    with open(GROUND_TRUTH, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)

if __name__ == '__main__':
    main()
