import {FaIconLibrary} from '@fortawesome/angular-fontawesome';
import {faGithub, faMedium} from '@fortawesome/free-brands-svg-icons';
import {faLocationArrow, faPaste, faPen, faQrcode} from '@fortawesome/free-solid-svg-icons';

export function registerIcons(library: FaIconLibrary): void {
  library.addIcons(
    faGithub,
    faMedium,
    faPen,
    faQrcode,
    faPaste,
    faLocationArrow
  );
}
