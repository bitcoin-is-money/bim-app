import {TestBed} from '@angular/core/testing';
import {FaIconLibrary} from '@fortawesome/angular-fontawesome';
import {faChevronRight} from '@fortawesome/free-solid-svg-icons';
import {TranslateModule} from '@ngx-translate/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SlideToConfirmComponent} from './slide-to-confirm.component';

describe('SlideToConfirmComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SlideToConfirmComponent, TranslateModule.forRoot()],
    }).compileComponents();
    TestBed.inject(FaIconLibrary).addIcons(faChevronRight);
  });

  it('emits (confirmed) once when slide crosses the threshold', () => {
    const fixture = TestBed.createComponent(SlideToConfirmComponent);
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    const emitSpy = vi.spyOn(instance.confirmed, 'emit');

    instance.mode.set('slide');
    instance.maxTrackPx.set(100);

    instance.thumbX.set(80);
    instance.dragging.set(true);
    instance.onPointerUp(new PointerEvent('pointerup', {pointerId: 1, clientX: 85}));

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(instance.consumed()).toBe(true);
  });

  it('does not emit when released below the threshold', () => {
    const fixture = TestBed.createComponent(SlideToConfirmComponent);
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    const emitSpy = vi.spyOn(instance.confirmed, 'emit');

    instance.mode.set('slide');
    instance.maxTrackPx.set(100);

    instance.thumbX.set(30);
    instance.dragging.set(true);
    instance.onPointerUp(new PointerEvent('pointerup', {pointerId: 1, clientX: 30}));

    expect(emitSpy).not.toHaveBeenCalled();
    expect(instance.thumbX()).toBe(0);
  });

  it('ignores interaction when disabled', () => {
    const fixture = TestBed.createComponent(SlideToConfirmComponent);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    const emitSpy = vi.spyOn(instance.confirmed, 'emit');

    instance.mode.set('slide');
    instance.maxTrackPx.set(100);

    instance.onPointerDown(new PointerEvent('pointerdown', {pointerId: 1, clientX: 50}));

    expect(instance.dragging()).toBe(false);
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
