import {CommonModule} from "@angular/common";
import {Component, Input} from '@angular/core';
import {FaIconComponent} from "@fortawesome/angular-fontawesome";
import {IconProp} from '@fortawesome/fontawesome-svg-core';

export type BaseNotificationData = {
  message: string;
  icon?: IconProp;
};

@Component({
  selector: 'app-base-notification',
  standalone: true,
  imports: [CommonModule, FaIconComponent],
  template: `
    <div class="flex items-center space-x-2">
      @if (data.icon) {
        <fa-icon [icon]="data.icon" class="w-5 h-5"></fa-icon>
      }
      <span class="flex-1">{{ data.message }}</span>
    </div>
  `,
})
export class BaseNotificationComponent {
  @Input() data: BaseNotificationData = { message: '' }
}
