import {CommonModule} from "@angular/common";
import {Component, Input} from '@angular/core';
import {FaIconComponent} from "@fortawesome/angular-fontawesome";
import {IconProp} from "@fortawesome/fontawesome-svg-core";
import {SpinnerComponent} from '../spinner/spinner.component';

export type StyleButtonVariant = 'special' | 'primary' | 'secondary' | 'tertiary' | 'contrast' | 'transparent';
export type ButtonSizeVariant = 'base' | 'lg' | 'xl';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule, FaIconComponent, SpinnerComponent],
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  @Input({ required: true }) variant!: StyleButtonVariant;
  @Input() sizeVariant: ButtonSizeVariant = 'base';
  @Input() icon?: IconProp;
  @Input() disabled = false;
  @Input() loading = false;
}

