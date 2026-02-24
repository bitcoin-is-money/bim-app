import {CommonModule} from "@angular/common";
import {Component, input} from '@angular/core';
import {FaIconComponent} from "@fortawesome/angular-fontawesome";
import {IconProp} from "@fortawesome/fontawesome-svg-core";
import {SpinnerComponent} from '../spinner/spinner.component';
import {SizeVariant, StyleVariant} from "../variant";

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule, FaIconComponent, SpinnerComponent],
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  readonly variant = input.required<StyleVariant>();
  readonly sizeVariant = input<SizeVariant>('base');
  readonly icon = input<IconProp | undefined>(undefined);
  readonly disabled = input(false);
  readonly loading = input(false);
}

