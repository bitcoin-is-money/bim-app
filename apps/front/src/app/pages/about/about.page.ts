import {CommonModule} from '@angular/common';
import {Component} from '@angular/core';
import {Router} from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './about.page.html',
  styleUrl: './about.page.scss',
})
export class AboutPage {
  constructor(private readonly router: Router) {}

  goBack(): void {
    this.router.navigate(['/home']);
  }
}
