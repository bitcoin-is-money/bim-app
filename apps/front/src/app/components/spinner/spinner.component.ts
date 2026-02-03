import {Component, Input} from '@angular/core';

export type SpinnerVariant = 'default' | 'primary' | 'secondary' | 'tertiary' | 'big' | 'transparent';

@Component({
  selector: 'app-spinner',
  standalone: true,
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
  host: {
    '[class]': 'variant',
  },
})
export class SpinnerComponent {
  @Input() variant: SpinnerVariant = 'default';
}
