import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {RailBadgeComponent, type RailNetwork} from './rail-badge.component';

describe('RailBadgeComponent', () => {
  function render(network: RailNetwork): HTMLElement {
    const fixture = TestBed.createComponent(RailBadgeComponent);
    fixture.componentRef.setInput('network', network);
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector('.rail-badge') as HTMLElement;
    return span;
  }

  it('renders BTC with .btc class', () => {
    const el = render('bitcoin');
    expect(el.classList.contains('btc')).toBe(true);
    expect(el.textContent?.trim()).toBe('BTC');
  });

  it('renders LN with .ln class', () => {
    const el = render('lightning');
    expect(el.classList.contains('ln')).toBe(true);
    expect(el.textContent?.trim()).toBe('LN');
  });

  it('renders SN with .sn class', () => {
    const el = render('starknet');
    expect(el.classList.contains('sn')).toBe(true);
    expect(el.textContent?.trim()).toBe('SN');
  });
});
