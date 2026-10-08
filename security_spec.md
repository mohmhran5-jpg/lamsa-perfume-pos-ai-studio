# Security Specification - لمسة عطر (Lamsa Perfume)

## 1. Data Invariants
1. **Authenticated Access**: Every write and read operation must originate from an authenticated session (`request.auth != null`), supporting multi-device anonymous and authenticated store staff access.
2. **Sales Atomicity & Financial Integrity**: Sales records must have positive non-zero total prices, valid item lists with valid bottle sizes and essence grams, and cannot contain malformed data.
3. **Inventory Conservation**: Gram stock deductions must not allow negative gram values unless explicitly allowed for zero stock tracking.
4. **Settings Single-Source-of-Truth**: Store settings are maintained at `/settings/store` to provide uniform branding (Name, Logo, Slogan: "أثر يبقى وذكرى تدوم") across all client terminals.

## 2. The "Dirty Dozen" Payloads (Must be blocked)
1. **Unauthenticated Read**: Attempting to read sales without authentication.
2. **Unauthenticated Write**: Attempting to insert a sale without auth credentials.
3. **Poisoned Sale ID**: Document ID containing illegal traversal characters (`../../admin`).
4. **Negative Price Injection**: Creating a sale with `totalPrice: -500`.
5. **Junk Array Flood**: Sale with 5,000 array items to exhaust memory.
6. **Fake Collection Write**: Writing to an arbitrary collection outside the schema (e.g. `/system_backdoor`).
7. **Malformed Settings Object**: Overwriting `/settings/store` with a plain string instead of object.
8. **Negative Essence Grams**: Adding a perfume with `stock_grams: -1000`.
9. **Fake Expense**: Adding an expense without category and amount.
10. **Null ID Product**: Creating a product document with null or missing identity.
11. **Non-numeric Bottle Size**: Injecting string into bottle size numeric field.
12. **Malicious Script Injection**: Storing script tags inside customer name.
