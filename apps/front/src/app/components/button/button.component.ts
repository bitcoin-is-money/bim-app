import {CommonModule} from "@angular/common";
import {Component, Input} from '@angular/core';
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
  @Input({ required: true }) variant!: StyleVariant;
  @Input() sizeVariant: SizeVariant = 'base';
  @Input() icon: IconProp | undefined;
  @Input() disabled = false;
  @Input() loading = false;
}

