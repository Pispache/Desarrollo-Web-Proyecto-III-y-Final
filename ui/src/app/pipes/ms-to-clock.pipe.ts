import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'msToClock',
  standalone: true,
})
export class MsToClockPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    const ms = Math.max(0, Math.floor(value ?? 0));
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }
}
