import {Component, input, model} from '@angular/core';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import type {IconProp} from '@fortawesome/fontawesome-svg-core';

@Component({
  selector: 'app-field',
  standalone: true,
  imports: [FaIconComponent],
  templateUrl: './field.component.html',
  styleUrl: './field.component.scss',
})
export class FieldComponent {
  readonly value = model<string>('');
  readonly editable = input(false);
  readonly label = input<string | undefined>();
  readonly icon = input<IconProp | undefined>();
  readonly suffix = input<string | undefined>();
  readonly placeholder = input('');
  readonly monospace = input(false);
  readonly inputFilter = input<((value: string) => string) | undefined>(undefined);

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const filter = this.inputFilter();
    if (filter) {
      const sanitized = filter(target.value);
      if (sanitized !== target.value) {
        target.value = sanitized;
      }
      this.value.set(sanitized);
    } else {
      this.value.set(target.value);
    }
  }
}
