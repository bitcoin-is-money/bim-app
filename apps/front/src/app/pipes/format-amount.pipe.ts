import {inject, Pipe, PipeTransform} from '@angular/core';
import {Amount} from '../model';
import {I18nService} from '../services/i18n.service';

@Pipe({
  name: 'formatAmount',
  standalone: true,
  pure: false,
})
export class FormatAmountPipe implements PipeTransform {
  private readonly i18nService = inject(I18nService);

  transform(amount: Amount): string {
    return amount.format(this.i18nService.currentLocale());
  }
}
