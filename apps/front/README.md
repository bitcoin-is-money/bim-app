

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

## Notifications

All toasts go through `NotificationService` (`src/app/services/notification.service.ts`), which wraps `ngxpert/hot-toast`. Four kinds are available, each with its own colour:

| Kind      | Colour  | Method                           |
|-----------|---------|----------------------------------|
| `success` | green   | `notificationService.success()`  |
| `info`    | white   | `notificationService.info()`     |
| `warning` | amber   | `notificationService.warning()`  |
| `error`   | red     | `notificationService.error()`    |

`success` toasts accept an optional `useConfetti: true` flag that fires a confetti animation — reserved for terminal success of a payment/receive flow.

### Receive flows

| Flow              | Event (status)         | Kind      | i18n key                                     | Message                        | Source                                            |
|-------------------|------------------------|-----------|----------------------------------------------|--------------------------------|---------------------------------------------------|
| Receive Lightning | invoice created        | `success` | `notifications.receive.lightning.ready`      | Lightning invoice ready        | `receive.service.ts` → `handleReceiveSuccess`     |
| Receive Lightning | swap `paid`            | `info`    | `notifications.receive.lightning.paid`       | Lightning payment received     | `swap-polling.service.ts` → `NOTIFICATIONS`       |
| Receive Lightning | swap `completed` 🎉    | `success` | `notifications.receive.lightning.completed`  | Funds available                | `swap-polling.service.ts` (with confetti)         |
| Receive Lightning | swap `expired`         | `error`   | `notifications.receive.lightning.expired`    | Invoice expired                | `swap-polling.service.ts`                         |
| Receive Lightning | swap `failed`          | `error`   | `notifications.receive.lightning.failed`     | Receive failed                 | `swap-polling.service.ts`                         |
| Receive Lightning | swap `lost` (404)      | `error`   | `notifications.receive.lightning.lost`       | Receive tracking lost          | `swap-polling.service.ts`                         |
| Receive Bitcoin   | deposit address ready  | `success` | `notifications.receive.bitcoin.ready`        | Bitcoin deposit address ready  | `receive.service.ts` → `handleReceiveSuccess`     |
| Receive Bitcoin   | swap `paid`            | `info`    | `notifications.receive.bitcoin.paid`         | Bitcoin confirmed, finalizing… | `swap-polling.service.ts`                         |
| Receive Bitcoin   | swap `completed` 🎉    | `success` | `notifications.receive.bitcoin.completed`    | Funds available                | `swap-polling.service.ts` (with confetti)         |
| Receive Bitcoin   | swap `completed` (bonus) | `info`  | `notifications.receive.bitcoin.depositRefunded` | Security deposit refunded   | `swap-polling.service.ts` (fired alongside `completed`) |
| Receive Bitcoin   | swap `expired`         | `error`   | `notifications.receive.bitcoin.expired`      | Deposit window expired         | `swap-polling.service.ts`                         |
| Receive Bitcoin   | swap `failed`          | `error`   | `notifications.receive.bitcoin.failed`       | Receive failed                 | `swap-polling.service.ts`                         |
| Receive Bitcoin   | swap `lost`            | `error`   | `notifications.receive.bitcoin.lost`         | Receive tracking lost          | `swap-polling.service.ts`                         |
| Receive Starknet  | address ready          | `success` | `notifications.receive.starknet.ready`       | Starknet address ready         | `receive.service.ts` → `handleReceiveSuccess`     |
| Receive Starknet  | incoming transfer detected 🎉 | `success` | `notifications.receive.starknet.completed` | Funds available             | `receive.service.ts` → `transactionService.waitForNew` (with confetti) |

> **Note — Receive Starknet emits a single terminal `success` toast.** Unlike Lightning/Bitcoin (which surface an intermediate `paid` info + a terminal `completed` success), Starknet has no intermediate state: the on-chain transfer detected by the Apibara indexer is both the payment and the finalisation, so a single green `completed` toast is emitted (with confetti).

### Send (pay) flows

| Flow            | Event (status)            | Kind      | i18n key                                   | Message                          | Source                                       |
|-----------------|---------------------------|-----------|--------------------------------------------|----------------------------------|----------------------------------------------|
| Pre-flight      | insufficient balance      | `error`   | `payConfirm.insufficientBalance`           | (see i18n)                       | `pay-confirm.page.ts`                        |
| Send Lightning  | execute ok (intermediate) | `info`    | `notifications.send.lightning.sent`        | Payment sent                     | `pay.service.ts` → `handleSuccess`           |
| Send Lightning  | swap `completed` 🎉       | `success` | `notifications.send.lightning.completed`   | Lightning payment delivered      | `swap-polling.service.ts` (with confetti)    |
| Send Lightning  | swap `refunded`           | `info`    | `notifications.send.lightning.refunded`    | Payment refunded                 | `swap-polling.service.ts`                    |
| Send Lightning  | swap `failed`             | `error`   | `notifications.send.lightning.failed`      | Payment failed                   | `swap-polling.service.ts`                    |
| Send Lightning  | swap `lost`               | `error`   | `notifications.send.lightning.lost`        | Payment tracking lost            | `swap-polling.service.ts`                    |
| Send Bitcoin    | execute ok (intermediate) | `info`    | `notifications.send.bitcoin.sent`          | Bitcoin payment broadcast        | `pay.service.ts`                             |
| Send Bitcoin    | swap `completed` 🎉       | `success` | `notifications.send.bitcoin.completed`     | Bitcoin payment confirmed        | `swap-polling.service.ts` (with confetti)    |
| Send Bitcoin    | swap `refundable`         | `error`   | `notifications.send.bitcoin.refundable`    | Action required: refund available| `swap-polling.service.ts`                    |
| Send Bitcoin    | swap `refunded`           | `info`    | `notifications.send.bitcoin.refunded`      | Payment refunded                 | `swap-polling.service.ts`                    |
| Send Bitcoin    | swap `failed`             | `error`   | `notifications.send.bitcoin.failed`        | Payment failed                   | `swap-polling.service.ts`                    |
| Send Bitcoin    | swap `lost`               | `error`   | `notifications.send.bitcoin.lost`          | Payment tracking lost            | `swap-polling.service.ts`                    |
| Send Starknet   | tx submitted              | `info`    | `notifications.send.starknet.sent`         | Transaction submitted            | `pay.service.ts`                             |
| Send Starknet   | tx failed                 | (unused)  | `notifications.send.starknet.failed`       | Transaction failed               | (defined in i18n but no caller today)        |

> **Note — Send Starknet has no terminal `success` toast** either. The flow only emits the `info` "Transaction submitted" toast because no swap is created; there is no equivalent of `.completed` with confetti.

### Auth & registration

| Event                       | Kind      | i18n key                                   | Source                        |
|-----------------------------|-----------|--------------------------------------------|-------------------------------|
| Username too short          | (varies)  | `notifications.usernameTooShort`           | `account-setup.page.ts`       |
| Registration cancelled      | (varies)  | `notifications.registrationCancelled`      | `auth.service.ts`             |
| Registration failed         | (varies)  | `notifications.registrationFailed`         | `auth.service.ts`             |
| Authentication cancelled    | (varies)  | `notifications.authenticationCancelled`    | `auth.service.ts`             |
| Authentication failed       | (varies)  | `notifications.authenticationFailed`       | `auth.service.ts`             |

### HTTP errors (global)

`httpNotificationInterceptor` (`src/app/interceptor/http-notification.interceptor.ts`) emits an `error` toast for any HTTP 4xx/5xx response, translating structured `{ error: { code, message, args? } }` payloads via `I18nService.translateError`. A request can opt out by setting the `SUPPRESS_ERROR_NOTIFICATION` context token. 401s are deduplicated with a stable id (`session-expired`).

