import { Component, input, model } from '@angular/core';

@Component({
  selector: 'app-checkbox-field',
  standalone: true,
  templateUrl: './checkbox-field.component.html',
  styleUrl: './checkbox-field.component.scss',
})
export class CheckboxFieldComponent {
  readonly checked = model(false);
  readonly label = input('');

  onToggle(event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    this.checked.set(value);
  }
}
