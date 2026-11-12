"""Make an `n8n export:workflow` file safe to publish.

The raw export holds the owner's name and email, instance/credential/workflow IDs, the Google Sheet ID
and local file paths. This keeps only what is needed to import and run the workflow, and puts
placeholders where each user must choose their own sheet and folder. Run:
    .venv/Scripts/python tools/sanitize_workflow.py RAW_EXPORT.json workflows/NAME.json
Keep the raw export outside the repo.
"""
import json, sys

SHEET_PLACEHOLDER = 'YOUR_SPREADSHEET_ID'
FOLDER_PLACEHOLDER = 'C:/path/to/invoice-checker/invoices/'
KEEP_TOP = ['name', 'description', 'nodes', 'connections']
KEEP_SETTINGS = ['executionOrder', 'binaryMode']


def clean_node(node):
    node = dict(node)
    node.pop('credentials', None)  # each user picks their own credential after importing
    p = node.get('parameters', {})
    if 'documentId' in p:
        p['documentId'] = {'__rl': True, 'mode': 'id', 'value': SHEET_PLACEHOLDER}
    if isinstance(p.get('sheetName'), dict):
        tab = p['sheetName'].get('cachedResultName')
        if tab:  # refer to the tab by name instead of the sheet's internal gid and URL
            p['sheetName'] = {'__rl': True, 'mode': 'name', 'value': tab}
    if 'fileSelector' in p:
        p['fileSelector'] = FOLDER_PLACEHOLDER + p['fileSelector'].rsplit('/', 1)[-1]
    return node


def clean_workflow(wf):
    out = {k: wf[k] for k in KEEP_TOP if k in wf}
    out['nodes'] = [clean_node(n) for n in wf['nodes']]
    out['settings'] = {k: v for k, v in wf.get('settings', {}).items() if k in KEEP_SETTINGS}
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    data = json.load(open(src, encoding='utf-8'))
    workflows = data if isinstance(data, list) else [data]
    if len(workflows) != 1:
        sys.exit(f'expected one workflow in {src}, found {len(workflows)}')
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(clean_workflow(workflows[0]), f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'wrote {dst}')


if __name__ == '__main__':
    main()
