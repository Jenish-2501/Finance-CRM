# Challan PDF layout — Test Plan

`buildChallanPdf` is pure layout code (jsPDF + autotable, A4 grid). Tests build real
documents and assert on the PDF content stream (WinAnsi literals are searchable).
They lock the redesign: ruled grids, footer format, no dangling contact dash,
no duplicated city in addresses, consistent Weight column.

## Scenarios
| # | Input | Expected in output |
|---|-------|--------------------|
| 1 | typical 2-item challan (one weighted) | DELIVERY CHALLAN, ref, both product names, Weight column, Page 1 of 1 |
| 2 | footer | contains 'Page 1 of 1', NOT '{ref}  |  Page' (the bare-number bug) |
| 3 | customer without mobile | no 'Contact: -' line |
| 4 | address ending with city ('Ring Road surat' + Surat) | 'Ring Road, Surat', NOT 'surat Surat' |
| 5 | rows with/without weight | Weight cells show value or '-' consistently |
| 6 | 30 items | ≥2 pages, 'Page 2 of' present |
| 7 | empty items | builds, 1 page, totals 0 |
| 8 | standard input | footer carries business address + contact |
| 9 | business + customer without phones | no 'Contact:' anywhere |
