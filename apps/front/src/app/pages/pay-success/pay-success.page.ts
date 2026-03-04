import type {OnInit} from '@angular/core';
import {Component, computed, inject} from '@angular/core';
import {Router} from '@angular/router';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {TranslateModule} from '@ngx-translate/core';
import {FullPageLayoutComponent} from '../../layout';
import {PayService} from '../../services/pay.service';

@Component({
  selector: 'app-pay-success',
  standalone: true,
  imports: [TranslateModule, FaIconComponent, FullPageLayoutComponent],
  templateUrl: './pay-success.page.html',
  styleUrl: './pay-success.page.scss',
})
export class PaySuccessPage implements OnInit {

  private readonly router = inject(Router);
  private readonly payService = inject(PayService);

  readonly isSwap = computed(() => {
    const network = this.payService.lastPaymentNetwork();
    return network === 'lightning' || network === 'bitcoin';
  });

  ngOnInit(): void {
    setTimeout(() => this.router.navigate(['/home']), 4000);
  }
}
