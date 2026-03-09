import {Component, input} from '@angular/core';
import type {ColorVariant} from "../variant";

@Component({
  selector: 'app-spinner',
  standalone: true,
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
  host: {
    '[class]': 'colorVariant() ?? ""',
  },
})
export class SpinnerComponent {
  readonly colorVariant = input<ColorVariant>();
}
