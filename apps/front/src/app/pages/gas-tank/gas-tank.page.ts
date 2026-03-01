import type { OnInit} from '@angular/core';
import {Component, inject} from '@angular/core';
import {TranslateModule} from '@ngx-translate/core';
import {FieldComponent} from '../../components/field/field.component';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {FullPageLayoutComponent} from '../../layout';
import {AccountService} from '../../services/account.service';

@Component({
  selector: 'app-gas-tank',
  standalone: true,
  imports: [TranslateModule, GoBackHeaderComponent, FieldComponent, FullPageLayoutComponent],
  templateUrl: './gas-tank.page.html',
  styleUrl: './gas-tank.page.scss',
})
export class GasTankPage implements OnInit {

  readonly accountService = inject(AccountService);

  ngOnInit(): void {
    this.accountService.loadBalance();
  }
}
