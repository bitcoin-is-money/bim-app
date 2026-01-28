import {CommonModule} from '@angular/common';
import {Component, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ButtonComponent} from "../../components/button/button.component";
import {GoBackHeaderComponent} from "../../components/go-back-header/go-back-header.component";
import {LogoFooterComponent} from "../../components/logo-footer/logo-footer.component";
import {AuthService} from '../../services/auth.service';

@Component({
  selector: 'app-pay',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, LogoFooterComponent, GoBackHeaderComponent],
  templateUrl: './pay.page.html',
  styleUrl: './pay.page.scss',
})
export class PayPage {

  private readonly authService: AuthService = inject(AuthService);

  username = signal('');

  scanQRCode(): void {
    if (false) {
      this.authService.signIn();
    }
  }

  pasteFromClipboard(): void {

  }


}
