import {CommonModule} from '@angular/common';
import {Component, inject, OnDestroy, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Html5Qrcode, Html5QrcodeSupportedFormats} from 'html5-qrcode';
import {ButtonComponent} from '../../components/button/button.component';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {LogoFooterComponent} from '../../components/logo-footer/logo-footer.component';
import {NotificationService} from '../../services/notification.service';
import {PayService} from '../../services/pay.service';
import {environment} from '../../../environments/environment';

@Component({
  selector: 'app-pay',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, LogoFooterComponent, GoBackHeaderComponent],
  templateUrl: './pay.page.html',
  styleUrl: './pay.page.scss',
})
export class PayPage implements OnDestroy {

  private readonly paymentService = inject(PayService);
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
        this.notifications.error({message: 'Clipboard is empty'});
        return;
      }
      this.paymentService.parseAndNavigate(text.trim());
    } catch {
      this.notifications.error({message: 'Could not read clipboard. Please allow clipboard access.'});
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
        message: 'Camera is not supported in this browser'
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
        useBarCodeDetectorIfSupported: true,
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
      const message = error instanceof Error
        ? error.message
        : 'Failed to start scanner';
      if (error instanceof Error && error.name === 'NotAllowedError') {
        this.scannerError.set('Camera access was denied. Please allow camera access in your browser settings.');
      } else if (error instanceof Error && error.name === 'NotFoundError') {
        this.scannerError.set('No camera found on this device.');
      } else {
        this.scannerError.set(message);
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
