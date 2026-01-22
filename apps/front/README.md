

## Icons

All icons in this application are managed using Font Awesome.

### How to Use

Register the icon in icon.ts:

```typescript
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faQrcode } from '@fortawesome/free-solid-svg-icons';

export function registerIcons(library: FaIconLibrary) {
  library.addIcons(faQrcode);
}
```

This approach ensures that only the icons explicitly registered here are included in the final bundle, keeping the app lightweight.

Use the icon in a button:
```html
<app-button variant="primary" [icon]="['fas', 'qrcode']">
  Save
</app-button>
```

## Style

Use [Tailwind CSS](https://tailwindcss.com/docs).

