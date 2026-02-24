import {CommonModule} from "@angular/common";
import {AfterViewInit, Component, inject, TemplateRef, ViewChild} from '@angular/core';
import {NotificationService} from "../../services/notification.service";

@Component({
  selector: 'app-notification-host',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-host.component.html',
  styleUrls: ['./notification-host.component.scss'],
})
export class NotificationHostComponent implements AfterViewInit {

  @ViewChild('notificationTemplate') notifTemplate!: TemplateRef<unknown>;

  private readonly notificationService = inject(NotificationService);

  ngAfterViewInit() {
    this.notificationService.registerTemplate(this.notifTemplate);
  }

}
