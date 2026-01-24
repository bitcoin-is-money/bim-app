import {Component} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {NotificationHostComponent} from "./components/notification/notification-host.component";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NotificationHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
}
