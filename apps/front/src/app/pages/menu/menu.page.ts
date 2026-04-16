import {Component, inject} from '@angular/core';
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
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  navigateToMyAccount(): void {
    void this.router.navigate(['/my-account']);
  }

  navigateToSettings(): void {
    void this.router.navigate(['/settings']);
  }

  navigateToAbout(): void {
    void this.router.navigate(['/about']);
  }

  navigateToFaq(): void {
    void this.router.navigate(['/faq']);
  }

  logout(): void {
    void this.authService.signOut();
  }
}
