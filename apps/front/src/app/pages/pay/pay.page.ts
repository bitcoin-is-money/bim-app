import {CommonModule} from '@angular/common';
import {Component, inject, OnDestroy, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TranslateModule} from '@ngx-translate/core';
import {Html5Qrcode, Html5QrcodeSupportedFormats} from 'html5-qrcode';
import {environment} from '../../../environments/environment';
import {ButtonComponent} from '../../components/button/button.component';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {FullPageLayoutComponent} from '../../layout';
import {I18nService} from '../../services/i18n.service';
import {NotificationService} from '../../services/notification.service';
import {PayService} from '../../services/pay.service';

@Component({
  selector: 'app-pay',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, ButtonComponent, GoBackHeaderComponent, FullPageLayoutComponent],
  templateUrl: './pay.page.html',
  styleUrl: './pay.page.scss',
})
export class PayPage implements OnDestroy {

  private readonly paymentService = inject(PayService);
  private readonly i18n = inject(I18nService);
  private readonly notifications = inject(NotificationService);

  private scanner: Html5Qrcode | null = null;
  private scannerStarted = false;

  readonly isLoading = this.paymentService.isLoading;
  readonly scanning = signal(false);
  readonly scannerError = signal('');

  scanQRCode(): void {
    if (!environment.useQRCodeScanner) {
      console.log('Skip QR code scanning');
      this.paymentService.parseAndNavigate('lnbc500000000n1mock');
      return;
    }
    this.startScanner();
  }

  async pasteFromClipboard(): Promise<void> {
    if (!environment.production) {
      this.paymentService.parseAndNavigate('lnbc500000000n1mock');
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (!text?.trim()) {
        this.notifications.error({message: this.i18n.t('pay.clipboardEmpty')});
        return;
      }
      this.paymentService.parseAndNavigate(text.trim());
    } catch {
      this.notifications.error({message: this.i18n.t('pay.clipboardAccessDenied')});
    }
  }

  closeScanner(): void {
    this.stopScanner();
  }

  ngOnDestroy(): void {
    this.stopScanner();
  }

  private startScanner(): void {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.notifications.error({
        message: this.i18n.t('pay.cameraNotSupported')
      });
      return;
    }
    this.scanning.set(true);
    this.scannerError.set('');

    // Wait for the DOM element to render before initializing the scanner
    setTimeout(() => this.initScanner(), 0);
  }

  private async initScanner(): Promise<void> {
    try {
      this.scanner = new Html5Qrcode('qr-reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: false,
        verbose: false,
      });

      const viewportMin = Math.min(window.innerWidth, window.innerHeight);
      const qrBoxSize = Math.round(Math.min(300, Math.max(200, viewportMin * 0.6)));

      await this.scanner.start(
        {
          facingMode: 'environment'
        }, {
          fps: 15,
          qrbox: {width: qrBoxSize, height: qrBoxSize},
        },
        (decodedText) => {
          console.log("[QRCode] decodedText = ", decodedText);
          this.stopScanner();
          this.paymentService.parseAndNavigate(decodedText);
        },
        () => {
          // QR decode attempts - expected, no action needed
        },
      );
      this.scannerStarted = true;
    } catch (error) {
      if (error instanceof Error && error.name === 'NotAllowedError') {
        this.scannerError.set(this.i18n.t('pay.cameraAccessDenied'));
      } else if (error instanceof Error && error.name === 'NotFoundError') {
        this.scannerError.set(this.i18n.t('pay.noCameraFound'));
      } else {
        this.scannerError.set(this.i18n.t('pay.scannerFailed'));
      }
    }
  }

  private async stopScanner(): Promise<void> {
    const scanner = this.scanner;
    this.scanner = null;
    this.scanning.set(false);
    this.scannerError.set('');

    if (!scanner) return;

    try {
      if (this.scannerStarted) {
        await scanner.stop();
      }
    } catch {
      // Ignore stop errors (scanner may not be running)
    }

    try {
      scanner.clear();
    } catch {
      // Ignore clear errors (DOM the element may already be removed)
    }

    this.scannerStarted = false;
  }
}
