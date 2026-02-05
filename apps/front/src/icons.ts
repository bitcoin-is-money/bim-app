import {FaIconLibrary} from '@fortawesome/angular-fontawesome';
import {faGithub} from '@fortawesome/free-brands-svg-icons';
import {
  faArrowLeft,
  faCircleCheck,
  faCoins,
  faLocationArrow,
  faPaste,
  faPen,
  faQrcode,
  faShareNodes
} from '@fortawesome/free-solid-svg-icons';

export function registerIcons(library: FaIconLibrary): void {
  library.addIcons(
    faGithub,         // Github: 'fas', 'github'
    faPen,            // Editable field: 'fas', 'pen'
    faQrcode,         // QRCode: 'fas', 'qrcode'
    faPaste,          // Clipboard: 'fas', 'paste'
    faLocationArrow,  // Pay: 'fas', 'location-arrow'
    faCircleCheck,    // Payment success: 'fas', 'circle-check'
    faShareNodes,     // Share: 'fas', 'share-nodes'
    faCoins,          // Money: 'fas', 'coins'
    faArrowLeft       // back: 'fas', 'arrow-left'
  );
}
