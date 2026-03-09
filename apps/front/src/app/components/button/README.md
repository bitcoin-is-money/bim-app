# Button Component

`<app-button>` is the shared button component used across the application.

## Inputs

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `colorVariant` | `ColorVariant` | Yes | — | Background color |
| `variant` | `StyleVariant` | No | `'primary'` | Visual style (border, shape, padding) |
| `sizeVariant` | `SizeVariant` | No | `'base'` | Text size |
| `icon` | `IconProp` | No | `undefined` | FontAwesome icon |
| `disabled` | `boolean` | No | `false` | Disables the button |
| `loading` | `boolean` | No | `false` | Shows a spinner |

## Color Variants

Controls the background color, text color, and hover state.

| Value | Background | Text | Hover |
|-------|-----------|------|-------|
| `gold` | amber-500 | neutral-100 | amber-600 |
| `white` | neutral-100 | neutral-900 | neutral-200 |
| `black` | neutral-800 | neutral-200 | — |
| `transparent` | transparent | neutral-100 | — |
| `danger` | red-800 | neutral-100 | red-700 |

## Style Variants

Controls the border treatment, shape, and padding.

| Value | Border | Shape | Extra | Description |
|-------|--------|-------|-------|-------------|
| `primary` | 2px, matches bg color | rounded-md | — | Standard solid button |
| `secondary` | 2px, white (neutral-100) | rounded-md | hover fills white | Outlined button |
| `action` | 2px, white (neutral-100) | rounded-full | — | Pill-shaped button |
| `jumbo` | 2px, matches bg color | rounded-md | py-8, icon 150% | Large prominent button |
| `ghost` | none | rounded-md | text-lg | Minimal borderless button |

## Size Variants

| Value | Effect |
|-------|--------|
| `base` | Default text size |
| `lg` | `text-lg` |
| `xl` | `text-xl` |

## Usage Examples

```html
<!-- Gold CTA (sign in) -->
<app-button colorVariant="gold" variant="primary">Sign In</app-button>

<!-- Black outlined (sign up) -->
<app-button colorVariant="black" variant="secondary">Sign Up</app-button>

<!-- White pill with icon (share, confirm) -->
<app-button colorVariant="white" variant="action" [icon]="['fas', 'share-nodes']">Share</app-button>

<!-- Large dark button (scan QR, paste) -->
<app-button colorVariant="black" variant="jumbo" [icon]="['fas', 'qrcode']">Scan QR</app-button>

<!-- Ghost footer nav -->
<app-button colorVariant="transparent" variant="ghost" [icon]="['fas', 'qrcode']">Receive</app-button>

<!-- Danger action (clear) -->
<app-button colorVariant="danger" variant="action" [icon]="['fas', 'trash']">Clear All</app-button>

<!-- With loading state -->
<app-button colorVariant="white" variant="primary" [loading]="true" [disabled]="true">Creating...</app-button>
```
