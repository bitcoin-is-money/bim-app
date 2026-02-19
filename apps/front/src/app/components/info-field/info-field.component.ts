import {Component, input} from '@angular/core';

type InfoFieldVariant = 'default' | 'mono';

@Component({
  selector: 'app-info-field',
  standalone: true,
  templateUrl: './info-field.component.html',
  styleUrl: './info-field.component.scss',
})
export class InfoFieldComponent {
  label = input.required<string>();
  variant = input<InfoFieldVariant>('default');
}
