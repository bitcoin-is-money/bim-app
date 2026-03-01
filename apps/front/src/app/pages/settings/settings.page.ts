import {Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TranslateModule} from '@ngx-translate/core';
import {GoBackHeaderComponent} from '../../components/go-back-header/go-back-header.component';
import {FullPageLayoutComponent} from '../../layout';
import {Language} from '../../services/user-settings-http.service';
import {I18nService} from '../../services/i18n.service';

interface LanguageOption {
  code: Language;
  flag: string;
  name: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  {code: 'en', flag: '🇬🇧', name: 'English'},
  {code: 'fr', flag: '🇫🇷', name: 'Français'},
];

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, TranslateModule, GoBackHeaderComponent, FullPageLayoutComponent],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  private readonly i18n = inject(I18nService);

  readonly languages = LANGUAGE_OPTIONS;

  readonly currentLanguage = this.i18n.currentLang;

  onLanguageChange(lang: Language): void {
    this.i18n.setLang(lang);
  }

  getSelectedOption(): LanguageOption {
    return LANGUAGE_OPTIONS.find(l => l.code === this.currentLanguage()) ?? LANGUAGE_OPTIONS[0]!;
  }
}
