/**
 * The icon registry - feature 005 (T518; research D5-07; contract C5-14).
 *
 * `Icon` draws one of these glyphs from `phosphor-react-native`. A key is an app word
 * (`'chevron-left'`, `'cloud-upload'`), never a Phosphor name, so the glyph behind a key
 * can change without a screen noticing, and the fallback of D5-07 (the platform symbols)
 * would swap THIS file only.
 *
 * Each icon is imported by its DEEP path, `phosphor-react-native/src/icons/<Name>`, the
 * only subpath the package's `exports` map serves. The package root re-exports about 1,500
 * icons: importing it would put every one of them in the bundle, so Jest refuses the bare
 * specifier (`test/stubs/phosphor-barrel.js`) and `icon-registry.test.tsx` reads this file
 * to prove it never appears. Each icon is a plain function component over one memoised
 * `Svg`, so a list row that draws one pays for one node.
 *
 * Adding an icon: import it here, name it in `ICONS` under the group it belongs to, and
 * add the key to the vocabulary list of `icon-registry.test.tsx`.
 */
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { AirplaneIcon } from 'phosphor-react-native/src/icons/Airplane';
import { ArrowClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowClockwise';
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { ArrowRightIcon } from 'phosphor-react-native/src/icons/ArrowRight';
import { ArrowUUpLeftIcon } from 'phosphor-react-native/src/icons/ArrowUUpLeft';
import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { BedIcon } from 'phosphor-react-native/src/icons/Bed';
import { CalendarBlankIcon } from 'phosphor-react-native/src/icons/CalendarBlank';
import { CameraIcon } from 'phosphor-react-native/src/icons/Camera';
import { CarIcon } from 'phosphor-react-native/src/icons/Car';
import { CaretDownIcon } from 'phosphor-react-native/src/icons/CaretDown';
import { CaretLeftIcon } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { CaretUpIcon } from 'phosphor-react-native/src/icons/CaretUp';
import { CheckCircleIcon } from 'phosphor-react-native/src/icons/CheckCircle';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { ChecksIcon } from 'phosphor-react-native/src/icons/Checks';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { CloudArrowUpIcon } from 'phosphor-react-native/src/icons/CloudArrowUp';
import { CloudCheckIcon } from 'phosphor-react-native/src/icons/CloudCheck';
import { CloudSlashIcon } from 'phosphor-react-native/src/icons/CloudSlash';
import { CrosshairIcon } from 'phosphor-react-native/src/icons/Crosshair';
import { DotsSixVerticalIcon } from 'phosphor-react-native/src/icons/DotsSixVertical';
import { DotsThreeIcon } from 'phosphor-react-native/src/icons/DotsThree';
import { DownloadSimpleIcon } from 'phosphor-react-native/src/icons/DownloadSimple';
import { EnvelopeIcon } from 'phosphor-react-native/src/icons/Envelope';
import { EyeSlashIcon } from 'phosphor-react-native/src/icons/EyeSlash';
import { ExportIcon } from 'phosphor-react-native/src/icons/Export';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { FootprintsIcon } from 'phosphor-react-native/src/icons/Footprints';
import { ForkKnifeIcon } from 'phosphor-react-native/src/icons/ForkKnife';
import { GearSixIcon } from 'phosphor-react-native/src/icons/GearSix';
import { GlobeIcon } from 'phosphor-react-native/src/icons/Globe';
import { ImageIcon } from 'phosphor-react-native/src/icons/Image';
import { ImagesIcon } from 'phosphor-react-native/src/icons/Images';
import { InfoIcon } from 'phosphor-react-native/src/icons/Info';
import { LockIcon } from 'phosphor-react-native/src/icons/Lock';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { MapPinIcon } from 'phosphor-react-native/src/icons/MapPin';
import { MapTrifoldIcon } from 'phosphor-react-native/src/icons/MapTrifold';
import { MinusIcon } from 'phosphor-react-native/src/icons/Minus';
import { NotePencilIcon } from 'phosphor-react-native/src/icons/NotePencil';
import { PathIcon } from 'phosphor-react-native/src/icons/Path';
import { PencilSimpleIcon } from 'phosphor-react-native/src/icons/PencilSimple';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { QuestionIcon } from 'phosphor-react-native/src/icons/Question';
import { ShieldCheckIcon } from 'phosphor-react-native/src/icons/ShieldCheck';
import { ShoppingBagIcon } from 'phosphor-react-native/src/icons/ShoppingBag';
import { SignOutIcon } from 'phosphor-react-native/src/icons/SignOut';
import { SparkleIcon } from 'phosphor-react-native/src/icons/Sparkle';
import { StampIcon } from 'phosphor-react-native/src/icons/Stamp';
import { StopCircleIcon } from 'phosphor-react-native/src/icons/StopCircle';
import { SuitcaseIcon } from 'phosphor-react-native/src/icons/Suitcase';
import { SuitcaseRollingIcon } from 'phosphor-react-native/src/icons/SuitcaseRolling';
import { TagIcon } from 'phosphor-react-native/src/icons/Tag';
import { ListBulletsIcon } from 'phosphor-react-native/src/icons/ListBullets';
import { ListChecksIcon } from 'phosphor-react-native/src/icons/ListChecks';
import { TextBIcon } from 'phosphor-react-native/src/icons/TextB';
import { TicketIcon } from 'phosphor-react-native/src/icons/Ticket';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { TramIcon } from 'phosphor-react-native/src/icons/Tram';
import { UserCircleIcon } from 'phosphor-react-native/src/icons/UserCircle';
import { UserIcon } from 'phosphor-react-native/src/icons/User';
import { WalletIcon } from 'phosphor-react-native/src/icons/Wallet';
import { WarningCircleIcon } from 'phosphor-react-native/src/icons/WarningCircle';
import { WarningIcon } from 'phosphor-react-native/src/icons/Warning';
import { WifiHighIcon } from 'phosphor-react-native/src/icons/WifiHigh';
import { WifiSlashIcon } from 'phosphor-react-native/src/icons/WifiSlash';
import { XIcon } from 'phosphor-react-native/src/icons/X';

export const ICONS = {
  // Tab bar, headers, row cues
  globe: GlobeIcon,
  suitcase: SuitcaseIcon,
  'suitcase-rolling': SuitcaseRollingIcon,
  user: UserIcon,
  'user-circle': UserCircleIcon,
  'chevron-left': CaretLeftIcon,
  'chevron-right': CaretRightIcon,
  'chevron-up': CaretUpIcon,
  'chevron-down': CaretDownIcon,
  'arrow-left': ArrowLeftIcon,
  'arrow-right': ArrowRightIcon,
  // Actions
  plus: PlusIcon,
  minus: MinusIcon,
  x: XIcon,
  check: CheckIcon,
  checks: ChecksIcon,
  search: MagnifyingGlassIcon,
  pencil: PencilSimpleIcon,
  trash: TrashIcon,
  share: ExportIcon,
  ellipsis: DotsThreeIcon,
  refresh: ArrowClockwiseIcon,
  undo: ArrowUUpLeftIcon,
  download: DownloadSimpleIcon,
  locate: CrosshairIcon,
  'log-out': SignOutIcon,
  settings: GearSixIcon,
  grip: DotsSixVerticalIcon,
  'stop-circle': StopCircleIcon,
  // Status and feedback
  'check-circle': CheckCircleIcon,
  alert: WarningCircleIcon,
  warning: WarningIcon,
  info: InfoIcon,
  question: QuestionIcon,
  clock: ClockIcon,
  calendar: CalendarBlankIcon,
  lock: LockIcon,
  'shield-check': ShieldCheckIcon,
  'eye-off': EyeSlashIcon,
  // Sync and network
  'cloud-upload': CloudArrowUpIcon,
  'cloud-check': CloudCheckIcon,
  'cloud-off': CloudSlashIcon,
  sync: ArrowsClockwiseIcon,
  wifi: WifiHighIcon,
  'wifi-off': WifiSlashIcon,
  // Content
  image: ImageIcon,
  images: ImagesIcon,
  camera: CameraIcon,
  note: NotePencilIcon,
  'file-text': FileTextIcon,
  wallet: WalletIcon,
  map: MapTrifoldIcon,
  'map-pin': MapPinIcon,
  route: PathIcon,
  stamp: StampIcon,
  tag: TagIcon,
  mail: EnvelopeIcon,
  // Writing (the note editor's pictured formatting bar)
  bold: TextBIcon,
  list: ListBulletsIcon,
  'list-checks': ListChecksIcon,
  sparkle: SparkleIcon,
  // Categories and transport
  plane: AirplaneIcon,
  car: CarIcon,
  tram: TramIcon,
  footprints: FootprintsIcon,
  bed: BedIcon,
  'fork-knife': ForkKnifeIcon,
  ticket: TicketIcon,
  'shopping-bag': ShoppingBagIcon,
} as const satisfies Record<string, PhosphorIcon>;

/** What a screen passes as `Icon`'s `name`. */
export type IconKey = keyof typeof ICONS;

export const ICON_KEYS = Object.keys(ICONS) as IconKey[];

/**
 * The glyphs that point along the reading line: `Icon` mirrors them when the layout is
 * reversed (C5-14). Up, down and the symmetrical ones never mirror.
 */
export const DIRECTIONAL_ICONS: ReadonlySet<IconKey> = new Set<IconKey>([
  'chevron-left',
  'chevron-right',
  'arrow-left',
  'arrow-right',
  'log-out',
  'undo',
]);

/** True for a registry key; false for any other value, inherited property names included. */
export function isIconKey(value: unknown): value is IconKey {
  return typeof value === 'string' && Object.hasOwn(ICONS, value);
}
