import {Component, computed, effect, inject, signal} from '@angular/core';
import type {SafeHtml} from '@angular/platform-browser';
import {DomSanitizer} from '@angular/platform-browser';
import {TranslateModule} from '@ngx-translate/core';
import {renderSVG} from 'uqr';
import {AmountFieldComponent} from '../../components/amount-field/amount-field.component';
import {ButtonComponent} from '../../components/button/button.component';
import {FieldComponent} from '../../components/field/field.component';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {NetworkLogoComponent} from '../../components/network-logo/network-logo.component';
import {FullPageLayoutComponent} from '../../layout';
import {Amount} from '../../model';
import {CurrencyService} from '../../services/currency.service';
import {I18nService} from '../../services/i18n.service';
import {NotificationService} from '../../services/notification.service';
import {ReceiveService} from '../../services/receive.service';

type PaymentNetwork = 'starknet' | 'lightning' | 'bitcoin';

const NETWORKS: PaymentNetwork[] = ['starknet', 'lightning', 'bitcoin'];

@Component({
  selector: 'app-receive',
  standalone: true,
  imports: [
    TranslateModule,
    GoBackHeaderComponent,
    NetworkLogoComponent,
    AmountFieldComponent,
    FieldComponent,
    ButtonComponent,
    FullPageLayoutComponent,
  ],
  templateUrl: './receive.page.html',
  styleUrl: './receive.page.scss',
})
export class ReceivePage {

  private readonly sanitizer = inject(DomSanitizer);
  private readonly currencyService = inject(CurrencyService);
  private readonly i18n = inject(I18nService);
  private readonly notifications = inject(NotificationService);
  private readonly receiveService = inject(ReceiveService);
  readonly networks = NETWORKS;
  private animating = false;
  private touchStartX = 0;

  readonly amount = signal<Amount>(Amount.zero());
  readonly description = signal('');
  readonly useUriPrefix = signal(true);
  readonly activeNetworkIndex = signal(0);

  readonly qrSvg = signal<SafeHtml | undefined>(undefined);

  readonly animationSlideClass = signal('');

  readonly selectedNetwork = computed<PaymentNetwork>(() => {
    return NETWORKS[this.activeNetworkIndex()] ?? 'starknet'
  });

  readonly qrData = signal<string | undefined>(undefined);

  readonly qrPlaceholderMessage = computed(() => {
    if (this.amount().value === 0) {
      return this.i18n.t('receive.enterAmount');
    }
    return this.i18n.t('receive.createInvoiceForQr');
  });

  readonly isCreatingInvoice = this.receiveService.isLoading;
  readonly invoiceCreated = computed(() => this.receiveService.invoice() !== null);

  readonly showCreateInvoice = computed(() => {
    return this.qrData() === undefined && this.amount().isPositive();
  });

  constructor() {
    for (const network of NETWORKS) {
      const img = new Image();
      img.src = `/network-${network}.png`;
    }

    effect(() => {
      this.amount();
      this.selectedNetwork();
      this.useUriPrefix();

      this.qrSvg.set(undefined);
      this.qrData.set(undefined);
    });

    effect(() => {
      const invoice = this.receiveService.invoice();
      if (!invoice) return;

      let data: string;
      switch (invoice.network) {
        case 'starknet':
          data = invoice.uri;
          break;
        case 'lightning':
          data = invoice.invoice;
          break;
        case 'bitcoin':
          // pending_commit is handled by ReceiveService before reaching the invoice signal
          if ('bip21Uri' in invoice) {
            data = invoice.bip21Uri;
          } else {
            return;
          }
          break;
      }

      this.qrData.set(data);
      // @review-accepted: renderSVG from uqr produces pure SVG rectangles, data comes from server response
      this.qrSvg.set(this.sanitizer.bypassSecurityTrustHtml(renderSVG(data)));
    });
  }

  prevNetwork(): void {
    const i = this.activeNetworkIndex();
    if (i > 0) this.animateTo(i - 1, false);
  }

  nextNetwork(): void {
    const i = this.activeNetworkIndex();
    if (i < NETWORKS.length - 1) this.animateTo(i + 1, true);
  }

  scrollToIndex(networkIndex: number): void {
    const current = this.activeNetworkIndex();
    if (networkIndex === current) return;
    this.animateTo(networkIndex, networkIndex > current);
  }

  private animateTo(
    newIndex: number,
    goLeft: boolean
  ): void {
    if (this.animating) return;
    this.animating = true;

    if (this.invoiceCreated()) {
      this.amount.set(Amount.zero());
      this.description.set('');
      this.receiveService.reset();
    }

    this.animationSlideClass.set(goLeft ? 'slide-out-left' : 'slide-out-right');
    setTimeout(() => {
      this.activeNetworkIndex.set(newIndex);
      this.animationSlideClass.set(goLeft ? 'slide-in-from-right' : 'slide-in-from-left');
      setTimeout(() => {
        this.animationSlideClass.set('');
        this.animating = false;
      }, 150);
    }, 150);
  }

  onDescriptionChange(value: string): void {
    this.description.set(value);
  }

  onTouchStart(e: TouchEvent): void {
    this.touchStartX = e.changedTouches[0]?.clientX ?? 0;
  }

  onTouchEnd(e: TouchEvent): void {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - this.touchStartX;
    if (Math.abs(dx) < 30) return;
    if (dx < 0) this.nextNetwork();
    else this.prevNetwork();
  }

  createInvoice(): void {
    const network = this.selectedNetwork();
    const satAmount = this.currencyService.convert(this.amount(), 'SAT');
    const desc = this.description() || undefined;
    this.receiveService.createInvoice(network, Math.round(satAmount.value), desc, this.useUriPrefix());
  }

  async share(): Promise<void> {
    const data = this.qrData();
    if (!data) return;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check: navigator.share is not available in all browsers
    if (navigator.share) {
      try {
        await navigator.share({title: 'BIM Receive', text: data});
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          this.notifications.error({message: this.i18n.t('receive.sharingFailed')});
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(data);
        this.notifications.success({message: this.i18n.t('receive.copiedToClipboard')});
      } catch {
        this.notifications.error({message: this.i18n.t('receive.couldNotCopy')});
      }
    }
  }
}
