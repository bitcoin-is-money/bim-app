
# SAMPLE USAGE

```html
<!-- Amount with static currency -->
<app-amount-field [amount]="1000" currency="SAT" />

<!-- Editable amount -->
<app-amount-field [(amount)]="editableAmount" currency="SAT" [editable]="true" />

<!-- Amount with currency toggle -->
<app-amount-field [amount]="1000" [(currency)]="selectedCurrency" [currencyToggle]="true" />

<!-- Fee -->
<app-amount-field [amount]="150" currency="SAT" label="Fee" />

<!-- Loading state: pass undefined to show a spinner in place of the amount -->
<app-amount-field [amount]="undefined" label="Fee" />
```

## Loading state

When `amount` is `undefined`, the component displays a spinner centered in the field
instead of the amount value. The label and currency remain visible.
This is used to show a loading state while waiting for async data (e.g. real fee from LP quote).
