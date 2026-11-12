# Architecture

Both workflows share the same middle part. Only the start differs.

## Batch workflow (`workflows/invoice-checker-batch.json`)

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | When clicking 'Execute workflow' | Manual Trigger | Starts a run by hand |
| 2 | Read invoice PDFs | Read/Write Files from Disk | Reads every `invoice_*.pdf` in the folder, one item per file, in name order |
| 3 | Extract PDF text | Extract From File (PDF) | Turns the PDF in binary field `data` into text. Keep Source = JSON keeps `fileName` |
| 4 | AI extract fields | Information Extractor + `Gemini` model | Copies the fields into a fixed JSON schema. Temperature 0. Batching: 1 invoice at a time, 4.5 s apart |
| 5 | Read Approved | Google Sheets, Get Row(s) | Reads the invoices already approved, for the duplicate check. Execute Once + Always Output Data, so an empty sheet still lets the run continue |
| 6 | Check Rules | Code (Run Once for All Items) | `src/rules.js` unchanged, plus a short glue section. Decides pass or fail |
| 7 | Flagged? | If | Splits on `flagged` |
| 8 | Add to need review / Add to Approved / Add to Results | Google Sheets, Append Row | Map Automatically, extra fields ignored, cell format "Let n8n format" (raw values) |

## Demo workflow (`workflows/invoice-checker-demo-form.json`)

Nodes 1 and 2 are replaced by **Upload Invoice**, an n8n Form Trigger with one required PDF field.
The field's Custom Field Name is `invoice`, so the upload arrives in binary field `invoice`, and
Extract PDF text reads that field. In Form Trigger 2.4 and later, the binary field takes the
Custom Field Name when one is set, and the label otherwise. "Multiple Files" is off; with it on,
the field would be `invoice_0`.

## Design decisions

- **AI extracts, code decides.** The schema allows `null` for every field and the prompt says
  "never guess or work out a missing value", so a missing invoice number arrives as `null` and the
  rules flag it. The rules then re-check the arithmetic, which also catches most AI misreads.
- **Duplicates within one run.** The glue code adds each clean invoice to the approved list as it
  goes, so a second copy later in the same batch is caught, not just copies of invoices already in
  the sheet.
- **File names by position.** The Information Extractor outputs only the extracted fields, not the
  file name. The glue code takes the name from `Extract PDF text` at the same position. In the demo
  workflow it falls back to the uploaded file's name.
- **Rate limits.** Gemini 3.5 Flash-Lite's free tier allows 15 requests per minute. Batch size 1
  with a 4.5 s delay keeps the run under that. Gemini 3.8 Flash was tried first, but its free tier
  allows only 5 requests per minute and 20 per day, too few for 50 invoices.
- **Raw cell values.** "Let n8n format" stops Google Sheets from reinterpreting dates and numbers.
  Columns not in a sheet's header row are ignored instead of being added as new columns.
