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
    faGithub,
    faPen,
    faQrcode,
    faPaste,
    faLocationArrow,
    faCircleCheck,
    faShareNodes,
    faCoins,
    faArrowLeft,
    faArrowDown,
    faArrowUp,
    faSyncAlt,
    faClock,
    faTrash,
    faMugHot,
    faPaperPlane,
    faBell,
    faEllipsis,
    faFingerprint,
    faShieldHalved,
    faCopy,
    faCircleInfo,
    faChevronRight,
  );
}
