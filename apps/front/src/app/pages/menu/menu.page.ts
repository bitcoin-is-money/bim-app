import {Component} from '@angular/core';
import {Router} from '@angular/router';
import {TranslateModule} from '@ngx-translate/core';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {FullPageLayoutComponent} from '../../layout/full-page-layout/full-page-layout.component';
import {AuthService} from '../../services/auth.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [TranslateModule, GoBackHeaderComponent, FullPageLayoutComponent],
  templateUrl: './menu.page.html',
  styleUrl: './menu.page.scss',
})
export class MenuPage {
  constructor(
    private readonly router: Router,
    private readonly authService: AuthService
  ) {}

  navigateToSettings(): void {
    this.router.navigate(['/settings']);
  }

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
