import {Component} from '@angular/core';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [GoBackHeaderComponent],
  templateUrl: './about.page.html',
  styleUrl: './about.page.scss',
})
export class AboutPage {}
