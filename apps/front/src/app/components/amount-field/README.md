
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
```

