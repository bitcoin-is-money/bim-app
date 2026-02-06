import {Component, inject, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {FullPageLayoutComponent} from '../../layout/full-page-layout/full-page-layout.component';

@Component({
  selector: 'app-pay-success',
  standalone: true,
  imports: [FaIconComponent, FullPageLayoutComponent],
  templateUrl: './pay-success.page.html',
  styleUrl: './pay-success.page.scss',
})
export class PaySuccessPage implements OnInit {

  private readonly router = inject(Router);

  ngOnInit(): void {
    setTimeout(() => this.router.navigate(['/home']), 2000);
  }
}
