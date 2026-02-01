import {CommonModule} from "@angular/common";
import {Component, Input} from '@angular/core';
import {FaIconComponent} from "@fortawesome/angular-fontawesome";
import {IconProp} from "@fortawesome/fontawesome-svg-core";

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'big' | 'transparent';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule, FaIconComponent],
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  @Input({ required: true }) variant!: ButtonVariant;
  @Input() icon?: IconProp;
  @Input() disabled = false;
}

