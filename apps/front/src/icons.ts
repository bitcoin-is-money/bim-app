import type {FaIconLibrary} from '@fortawesome/angular-fontawesome';
import {faGithub} from '@fortawesome/free-brands-svg-icons';
import {
  faArrowDown,
  faArrowLeft,
  faArrowUp,
  faBell,
  faChevronRight,
  faCircleCheck,
  faCircleInfo,
  faClock,
  faCoins,
  faCopy,
  faEllipsis,
  faFingerprint,
  faLocationArrow,
  faMugHot,
  faPaperPlane,
  faPaste,
  faPen,
  faQrcode,
  faShareNodes,
  faShieldHalved,
  faSyncAlt,
  faTrash
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
    faArrowLeft,      // back: 'fas', 'arrow-left'
    faArrowDown,      // Credit tx: 'fas', 'arrow-down'
    faArrowUp,        // Debit tx: 'fas', 'arrow-up'
    faSyncAlt,        // refresh: 'fas', 'sync-alt'
    faClock,          // Payment in progress: 'fas', 'clock'
    faTrash,          // Delete: 'fas', 'trash'
    faMugHot,         // Support/donation: 'fas', 'mug-hot'
    faPaperPlane,     // Send: 'fas', 'paper-plane'
    faBell,           // Notifications: 'fas', 'bell'
    faEllipsis,       // Overflow menu: 'fas', 'ellipsis'
    faFingerprint,    // Passkey / biometric: 'fas', 'fingerprint'
    faShieldHalved,   // Security: 'fas', 'shield-halved'
    faCopy,           // Copy: 'fas', 'copy'
    faCircleInfo,     // Fee / info: 'fas', 'circle-info'
    faChevronRight,   // Slide-to-confirm thumb: 'fas', 'chevron-right'
  );
}
