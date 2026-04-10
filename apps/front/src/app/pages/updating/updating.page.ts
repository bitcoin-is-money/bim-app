import {Component} from '@angular/core';
import {FaIconComponent} from '@fortawesome/angular-fontawesome';
import {TranslateModule} from '@ngx-translate/core';

import {FullPageLayoutComponent} from '../../layout';

/**
 * Full-screen page displayed by PwaUpdateService while the client is
 * applying a Service Worker update and reloading. Not user-navigable —
 * only pushed programmatically when a pending PWA update has been
 * detected and cleared for activation.
 */
@Component({
  selector: 'app-updating',
  standalone: true,
  imports: [TranslateModule, FaIconComponent, FullPageLayoutComponent],
  templateUrl: './updating.page.html',
  styleUrl: './updating.page.scss',
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class UpdatingPage {}
