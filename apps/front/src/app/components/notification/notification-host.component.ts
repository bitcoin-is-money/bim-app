import {CommonModule} from "@angular/common";
import {AfterViewInit, Component, TemplateRef, ViewChild} from '@angular/core';
import {NotificationService} from "../../services/notification.service";

@Component({
  selector: 'app-notification-host',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-host.component.html',
  styleUrls: ['./notification-host.component.scss'],
})
export class NotificationHostComponent implements AfterViewInit {

  @ViewChild('notifTemplate') notifTemplate!: TemplateRef<any>;

  constructor(
    private readonly notificationService: NotificationService
  ) {}

  ngAfterViewInit() {
    this.notificationService.registerTemplate(this.notifTemplate);
  }

}

// <app-base-notification [message]="message" [icon]="['fas', 'qrcode']" />
