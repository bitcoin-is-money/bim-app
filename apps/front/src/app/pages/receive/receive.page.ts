import {Component, computed, effect, inject, signal} from '@angular/core';
import {DomSanitizer, SafeHtml} from '@angular/platform-browser';
import {TranslateModule} from '@ngx-translate/core';
import {renderSVG} from 'uqr';
import {AmountFieldComponent} from '../../components/amount-field/amount-field.component';
import {ButtonComponent} from '../../components/button/button.component';
import {FieldComponent} from '../../components/field/field.component';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {NetworkLogoComponent} from '../../components/network-logo/network-logo.component';
import {FullPageLayoutComponent} from '../../layout';
import {Amount} from '../../model';
import {AuthService} from '../../services/auth.service';
import {CurrencyService} from '../../services/currency.service';
import {I18nService} from '../../services/i18n.service';
import {NotificationService} from '../../services/notification.service';
import {ReceiveService} from '../../services/receive.service';
import {environment} from '../../../environments/environment';

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
  private readonly authService = inject(AuthService);
  private readonly currencyService = inject(CurrencyService);
  private readonly i18n = inject(I18nService);
  private readonly notifications = inject(NotificationService);
  private readonly receiveService = inject(ReceiveService);
  readonly networks = NETWORKS;
  private animating = false;
  private touchStartX = 0;

  readonly amount = signal<Amount>(Amount.zero());
  readonly description = signal('');
  readonly activeNetworkIndex = signal(0);

  readonly qrSvg = signal<SafeHtml | undefined>(undefined);

  readonly animationSlideClass = signal('');

  readonly starknetAddress = computed(() => {
    return this.authService.currentUser()?.starknetAddress ?? ''
  });

  readonly selectedNetwork = computed<PaymentNetwork>(() => {
    return NETWORKS[this.activeNetworkIndex()] ?? 'starknet'
  });

  readonly starknetUri = computed(() => {
    const addr = this.starknetAddress();
    if (!addr) return '';

    const amt = this.amount();
    const desc = this.description();
    const hasAmount = amt.value > 0;

    if (!hasAmount && !desc) {
      return `starknet:${addr}`;
    }

    const params = new URLSearchParams();
    if (hasAmount) {
      const satAmount = this.currencyService.convert(amt, 'SAT');
      params.set('amount', String(Math.round(satAmount.value)));
      params.set('token', environment.wbtcTokenAddress);
    }
    if (desc) {
      params.set('summary', desc);
    }

    return `starknet:${addr}?${params.toString()}`;
  });

  readonly qrData = signal<string | undefined>(undefined);

  readonly qrPlaceholderMessage = computed(() => {
    if (this.amount().value === 0) {
      return this.i18n.t('receive.enterAmount');
    }
    if (this.selectedNetwork() !== 'starknet') {
      return this.i18n.t('receive.createInvoiceForQr');
    }
    if (!this.starknetAddress()) {
      return this.i18n.t('receive.noStarknetAddress');
    }
    return '';
  });

  readonly isCreatingInvoice = this.receiveService.isLoading;
  readonly invoiceCreated = computed(() => this.receiveService.invoice() !== null);

  readonly showCreateInvoice = computed(() => {
    return this.selectedNetwork() !== 'starknet'
      && this.qrData() === undefined
      && this.amount().isPositive();
  });

  constructor() {
    for (const network of NETWORKS) {
      const img = new Image();
      img.src = `/network-${network}.png`;
    }

    effect(() => {
      const amt = this.amount();
      const network = this.selectedNetwork();

      if (amt.value === 0) {
        this.qrSvg.set(undefined);
        this.qrData.set(undefined);
        return;
      }

      switch (network) {
        case 'starknet': {
          const uri = this.starknetUri();
          if (uri) {
            this.qrData.set(uri);
            this.qrSvg.set(this.sanitizer.bypassSecurityTrustHtml(renderSVG(uri)));
          } else {
            this.qrSvg.set(undefined);
            this.qrData.set(undefined);
          }
          break;
        }
        case 'lightning':
        case 'bitcoin':
          this.qrSvg.set(undefined);
          this.qrData.set(undefined);
          break;
      }
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
          data = invoice.bip21Uri;
          break;
      }

      this.qrData.set(data);
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
    if (network === 'starknet') return;

    const satAmount = this.currencyService.convert(this.amount(), 'SAT');
    const desc = this.description() || undefined;
    this.receiveService.createInvoice(network, Math.round(satAmount.value), desc);
  }

  async share(): Promise<void> {
    const data = this.qrData();
    if (!data) return;

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
