import {Component, input} from '@angular/core';
import {StyleVariant} from "../variant";

@Component({
  selector: 'app-spinner',
  standalone: true,
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
  host: {
    '[class]': 'variant()',
  },
})
export class SpinnerComponent {
  readonly variant = input<StyleVariant>('secondary');
}
