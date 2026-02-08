import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {UserSettings} from "../model/user-settings";

export type Language = 'en' | 'fr';

export interface UpdateSettingsRequest {
  language?: Language;
  fiatCurrency?: string;
}

@Injectable({providedIn: 'root'})
export class I18nHttpService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/user/settings';

  getSettings(): Observable<UserSettings> {
    return this.http.get<UserSettings>(this.apiUrl);
  }

  updateSettings(settings: UpdateSettingsRequest): Observable<UserSettings> {
    return this.http.put<UserSettings>(this.apiUrl, settings);
  }
}
