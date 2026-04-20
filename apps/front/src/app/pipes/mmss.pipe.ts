import type {PipeTransform} from '@angular/core';
import {Pipe} from '@angular/core';

@Pipe({
  name: 'mmss',
  standalone: true,
})
export class MmssPipe implements PipeTransform {
  transform(seconds: number | undefined | null): string {
    if (seconds === undefined || seconds === null || seconds < 0 || !Number.isFinite(seconds)) {
      return '0:00';
    }
    const total = Math.floor(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
