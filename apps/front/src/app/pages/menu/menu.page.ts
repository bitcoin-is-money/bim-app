import {Component} from '@angular/core';
import {Router} from '@angular/router';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {FullPageLayoutComponent} from '../../layout/full-page-layout/full-page-layout.component';
import {AuthService} from '../../services/auth.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [GoBackHeaderComponent, FullPageLayoutComponent],
  templateUrl: './menu.page.html',
  styleUrl: './menu.page.scss',
})
export class MenuPage {
  constructor(
    private readonly router: Router,
    private readonly authService: AuthService
  ) {}

  navigateToSwaps(): void {
    this.router.navigate(['/swaps']);
  }

  navigateToAbout(): void {
    this.router.navigate(['/about']);
  }

  logout(): void {
    this.authService.signOut();
  }
}
