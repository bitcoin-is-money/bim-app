import {FaIconLibrary} from '@fortawesome/angular-fontawesome';
import {faGithub} from '@fortawesome/free-brands-svg-icons';
import {
  faArrowLeft,
  faCircleCheck,
  faCoins,
  faFileInvoice,
  faLocationArrow,
  faPaste,
  faPen,
  faQrcode,
  faShareNodes
} from '@fortawesome/free-solid-svg-icons';

export function registerIcons(library: FaIconLibrary): void {
  library.addIcons(
    faGithub,
    faPen,
    faQrcode,
    faPaste,
    faLocationArrow,
    faCircleCheck,
    faShareNodes,
    faFileInvoice,
    faCoins,
    faArrowLeft
  );
}
