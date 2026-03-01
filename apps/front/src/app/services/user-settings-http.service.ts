import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {UserSettings} from "../model/user-settings";

export type Language = 'en' | 'fr';

@Injectable({providedIn: 'root'})
export class UserSettingsHttpService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/user/settings';

  getSettings(): Observable<UserSettings> {
    return this.http.get<UserSettings>(this.apiUrl);
  }

  updateSettings(settings: Partial<UserSettings>): Observable<UserSettings> {
    return this.http.put<UserSettings>(this.apiUrl, settings);
  }
}
