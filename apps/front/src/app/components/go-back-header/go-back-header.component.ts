import {CommonModule, Location} from '@angular/common';
import {Component, input} from '@angular/core';

@Component({
  selector: 'app-go-back-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './go-back-header.component.html',
  styleUrl: './go-back-header.component.scss',
})
export class GoBackHeaderComponent {
  title = input.required<string>();

  constructor(private readonly location: Location) {}

  goBack(): void {
    this.location.back();
  }
}
