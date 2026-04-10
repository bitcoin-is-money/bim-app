import {CommonModule} from "@angular/common";
import type {AfterViewInit, TemplateRef} from '@angular/core';
import {Component, inject, ViewChild} from '@angular/core';
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
