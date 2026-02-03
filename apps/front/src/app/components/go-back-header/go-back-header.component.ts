import {CommonModule, Location} from '@angular/common';
import {Component, inject, input} from '@angular/core';
import {FaIconComponent} from "@fortawesome/angular-fontawesome";

@Component({
  selector: 'app-go-back-header',
  standalone: true,
  imports: [CommonModule, FaIconComponent],
  templateUrl: './go-back-header.component.html',
  styleUrl: './go-back-header.component.scss',
})
export class GoBackHeaderComponent {
  private readonly location = inject(Location);
  title = input.required<string>();

  goBack(): void {
    this.location.back();
  }
}
