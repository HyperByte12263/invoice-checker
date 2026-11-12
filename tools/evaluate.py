"""Score the workflow's Results sheet against data/ground_truth.csv.

Export the "Results" tab from Google Sheets as CSV (File > Download > CSV), then run:
    .venv/Scripts/python tools/evaluate.py data/results_export.csv --run-seconds 515.8

--run-seconds is the run's duration from n8n's Executions list. --tokens and --cost-usd are
the run's totals from the AI provider's usage page; they are optional and never estimated here.
"""
import argparse, csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GROUND_TRUTH = ROOT / 'data' / 'ground_truth.csv'
TEXT_FIELDS = ['vendor', 'invoice_no', 'date']
MONEY_FIELDS = ['subtotal', 'tax', 'total']


def read_rows(path):
    with open(path, newline='', encoding='utf-8-sig') as f:
        return {row['file']: row for row in csv.DictReader(f)}


def same_money(a, b):
    """Equal to the cent. Sheets may show 361 or 361.00; both are the same amount."""
    if a.strip() == '' or b.strip() == '':
        return a.strip() == b.strip()
    try:
        return round(float(a) * 100) == round(float(b) * 100)
    except ValueError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('results', help='Results tab exported as CSV')
    parser.add_argument('--run-seconds', type=float, help="run duration from n8n's Executions list")
    parser.add_argument('--tokens', type=int, help="total tokens for the run, from the provider's usage page")
    parser.add_argument('--cost-usd', type=float, help="total cost for the run, from the provider's billing page")
    args = parser.parse_args()

    truth = read_rows(GROUND_TRUTH)
    results = read_rows(args.results)
    n = len(truth)
    problems = []

    # Field accuracy: every field of every invoice, compared with what is printed on the PDF.
    fields = TEXT_FIELDS + MONEY_FIELDS
    correct = {f: 0 for f in fields}
    for file, gt in truth.items():
        row = results.get(file)
        if row is None:
            problems.append(f'{file}: missing from results')
            continue
        for f in fields:
            ok = same_money(row[f], gt[f]) if f in MONEY_FIELDS else row[f].strip() == gt[f].strip()
            if ok:
                correct[f] += 1
            else:
                problems.append(f'{file}: {f} extracted as {row[f]!r}, PDF has {gt[f]!r}')
    for file in results.keys() - truth.keys():
        problems.append(f'{file}: in results but not in ground truth')

    # Flags: planted errors should be flagged, clean invoices should not.
    planted = {f for f, gt in truth.items() if gt['planted_error']}
    flagged = {f for f, row in results.items() if row['flagged'].strip().upper() == 'TRUE'}
    caught = planted & flagged
    for file in sorted(planted - flagged):
        problems.append(f"{file}: MISSED planted error '{truth[file]['planted_error']}'")
    false_alarms = (flagged & truth.keys()) - planted
    for file in sorted(false_alarms):
        problems.append(f"{file}: FALSE ALARM, flagged with '{results[file].get('reasons', '')}'")

    total_correct = sum(correct.values())
    print(f'Invoices in ground truth: {n}, in results: {len(results)}')
    print(f'Field accuracy: {total_correct}/{n * len(fields)} ({total_correct / (n * len(fields)):.1%})')
    for f in fields:
        print(f'  {f:<11} {correct[f]}/{n}')
    print(f'Planted errors caught: {len(caught)}/{len(planted)}')
    print(f'False alarms: {len(false_alarms)}/{n - len(planted)}')
    print(f'Seconds per invoice: {args.run_seconds / n:.1f}' if args.run_seconds else
          'Seconds per invoice: not given (pass --run-seconds)')
    print(f'Tokens per invoice: {args.tokens / n:,.0f}' if args.tokens else
          'Tokens per invoice: not given (pass --tokens)')
    print(f'Cost per invoice: ${args.cost_usd / n:.5f}' if args.cost_usd is not None else
          'Cost per invoice: not given (pass --cost-usd)')
    print(f'\nWrong or missed ({len(problems)}):' if problems else '\nWrong or missed: none')
    for p in problems:
        print(f'  {p}')


if __name__ == '__main__':
    main()
