import {Component, input, model} from '@angular/core';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {IconProp} from '@fortawesome/fontawesome-svg-core';
import {faPen} from '@fortawesome/free-solid-svg-icons';

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

  protected readonly faPen = faPen;

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value.set(target.value);
  }
}
