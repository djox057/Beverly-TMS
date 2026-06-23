## Change

In `src/utils/invoiceGenerator.ts`, the decision to hide the "Terms: NET 30" and "Due Date" block is currently driven by the suffix-derived company (`derivedCompany === "BG Prime Inc"`). Switch it to be driven by the order's actual booked-by company.

### Edit

At line 310, replace:

```ts
const isBgPrimeInvoice = derivedCompany === "BG Prime Inc";
```

with:

```ts
const isBgPrimeInvoice = (order.bookedByCompanyName ?? derivedCompany) === "BG Prime Inc";
```

That is the only place that controls the Terms/Due Date rows (lines 316–321, 326–329, 334–341); no other logic changes.

### Effect on load 4000355995

- Internal load number: `2679-BG` (suffix maps to BG Prime Inc)
- Booked by: **BF Prime LLC**

After the change, this invoice will show **Terms: NET 30** and **Due Date: today + 30 days**, because the booked-by company is BF Prime LLC, not BG Prime Inc. Only invoices actually booked by BG Prime Inc will continue to hide those two rows.

### Out of scope

- No change to suffix-based invoice numbering (`formatInternalLoadNumber`) or legal-entity resolution used elsewhere.
- No change to the `isBgPrime` branch at line 515 — confirm with me if you also want that driven by booked-by, since it controls other layout pieces further down the PDF.
