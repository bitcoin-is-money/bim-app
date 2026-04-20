import type { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import {
  faArrowLeft,
  faCircleCheck,
  faClock,
  faCoins,
  faLocationArrow,
  faMugHot,
  faPaste,
  faPen,
  faQrcode,
  faShareNodes,
  faSyncAlt,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';

export function registerIcons(library: FaIconLibrary): void {
  library.addIcons(
    faGithub, // Github: 'fas', 'github'
    faPen, // Editable field: 'fas', 'pen'
    faQrcode, // QRCode: 'fas', 'qrcode'
    faPaste, // Clipboard: 'fas', 'paste'
    faLocationArrow, // Pay: 'fas', 'location-arrow'
    faCircleCheck, // Payment success: 'fas', 'circle-check'
    faShareNodes, // Share: 'fas', 'share-nodes'
    faCoins, // Money: 'fas', 'coins'
    faArrowLeft, // back: 'fas', 'arrow-left'
    faSyncAlt, // refresh, 'fas', 'sync-alt'
    faClock, // Payment in progress: 'fas', 'clock'
    faTrash, // Delete: 'fas', 'trash'
    faMugHot, // Support/donation: 'fas', 'mug-hot'
  );
}
