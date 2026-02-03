import {Component, computed, effect, inject, signal} from '@angular/core';
import QRCode from 'qrcode';
import {AmountFieldComponent} from '../../components/amount-field/amount-field.component';
import {ButtonComponent} from '../../components/button/button.component';
import {FieldComponent} from '../../components/field/field.component';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {LogoFooterComponent} from "../../components/logo-footer/logo-footer.component";
import {NetworkLogoComponent} from '../../components/network-logo/network-logo.component';
import {Amount} from '../../model';
import {AuthService} from '../../services/auth.service';
import {CurrencyService} from '../../services/currency.service';
import {NotificationService} from '../../services/notification.service';
import {ReceiveService} from '../../services/receive.service';

type PaymentNetwork = 'starknet' | 'lightning' | 'bitcoin';

const NETWORKS: PaymentNetwork[] = ['starknet', 'lightning', 'bitcoin'];
const WBTC_TOKEN_ADDRESS = '0x00abbd7d98ad664568f204d6e1af6e02d6a5c55eb4e83c9fbbfc3ed8514efc09';

@Component({
  selector: 'app-receive',
  standalone: true,
  imports: [
    GoBackHeaderComponent,
    NetworkLogoComponent,
    AmountFieldComponent,
    FieldComponent,
    ButtonComponent,
    LogoFooterComponent,
  ],
  templateUrl: './receive.page.html',
  styleUrl: './receive.page.scss',
})
export class ReceivePage {

  private readonly authService = inject(AuthService);
  private readonly currencyService = inject(CurrencyService);
  private readonly notifications = inject(NotificationService);
  private readonly receiveService = inject(ReceiveService);
  readonly networks = NETWORKS;
  private animating = false;
  private touchStartX = 0;

  readonly amount = signal<Amount>(Amount.zero());
  readonly description = signal('');
  readonly activeNetworkIndex = signal(0);

  readonly qrImageUrl = signal<string | undefined>(undefined);

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
      params.set('token', WBTC_TOKEN_ADDRESS);
    }
    if (desc) {
      params.set('summary', desc);
    }

    return `starknet:${addr}?${params.toString()}`;
  });

  readonly qrData = signal<string | undefined>(undefined);

  readonly qrPlaceholderMessage = computed(() => {
    if (this.amount().value === 0) {
      return 'Enter an amount';
    }
    if (this.selectedNetwork() !== 'starknet') {
      return 'Create an invoice to generate QR code';
    }
    if (!this.starknetAddress()) {
      return 'No Starknet address available';
    }
    return '';
  });

  readonly isCreatingInvoice = this.receiveService.isLoading;
  readonly invoiceCreated = computed(() => this.receiveService.invoice() !== null);

  readonly showCreateInvoice = computed(() => {
    return this.selectedNetwork() !== 'starknet';
  });

  constructor() {
    effect(() => {
      const amt = this.amount();
      const network = this.selectedNetwork();

      if (amt.value === 0) {
        this.qrImageUrl.set(undefined);
        this.qrData.set(undefined);
        return;
      }

      switch (network) {
        case 'starknet': {
          const uri = this.starknetUri();
          if (uri) {
            this.qrData.set(uri);
            QRCode.toDataURL(uri, {
              width: 256,
              margin: 2,
              color: {dark: '#000000', light: '#ffffff'},
            }).then(url => this.qrImageUrl.set(url));
          } else {
            this.qrImageUrl.set(undefined);
            this.qrData.set(undefined);
          }
          break;
        }
        case 'lightning':
        case 'bitcoin':
          this.qrImageUrl.set(undefined);
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
      QRCode.toDataURL(data, {
        width: 256,
        margin: 2,
        color: {dark: '#000000', light: '#ffffff'},
      }).then(url => this.qrImageUrl.set(url));
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
    this.receiveService.createInvoice(network, Math.round(satAmount.value));
  }

  async share(): Promise<void> {
    const data = this.qrData();
    if (!data) return;

    if (navigator.share) {
      try {
        await navigator.share({title: 'BIM Receive', text: data});
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          this.notifications.error({message: 'Sharing failed'});
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(data);
        this.notifications.success({message: 'Copied to clipboard'});
      } catch {
        this.notifications.error({message: 'Could not copy to clipboard'});
      }
    }
  }
}
