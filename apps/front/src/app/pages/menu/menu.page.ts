import {Component} from '@angular/core';
import {Router} from '@angular/router';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {AuthService} from '../../services/auth.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [GoBackHeaderComponent],
  templateUrl: './menu.page.html',
  styleUrl: './menu.page.scss',
})
export class MenuPage {
  constructor(
    private readonly router: Router,
    private readonly authService: AuthService
  ) {}

  navigateToAbout(): void {
    this.router.navigate(['/about']);
  }

  logout(): void {
    this.authService.signOut();
  }
}
