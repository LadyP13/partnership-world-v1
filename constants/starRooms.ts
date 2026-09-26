export type StarRoom = {
  id: string;
  label: string;
  /** percent positions relative to the starfield */
  left: `${number}%`;
  top: `${number}%`;
  size: number;
  /** future route; null = coming soon */
  route: string | null;
  hint: string;
  /** can be remade as a tile room in the builder */
  remakeable?: boolean;
};

export const STARS: StarRoom[] = [
  {
    id: 'hearth',
    label: 'Hearth',
    left: '48%',
    top: '28%',
    size: 30,
    route: '/',
    hint: 'Back to the home room',
    remakeable: true,
  },
  {
    id: 'rooms',
    label: 'Room Creator',
    left: '70%',
    top: '22%',
    size: 22,
    route: '/room-creator',
    hint: 'Imagine if…',
  },
  {
    id: 'twin',
    label: 'Twin Workshop',
    left: '28%',
    top: '58%',
    size: 22,
    route: '/twin-workshop',
    hint: 'Open the workshop pane on the laptop — local presence',
  },
];

export const REMAKEABLE_STARS = STARS.filter((star) => star.remakeable);

const CUSTOM_SLOTS: { left: `${number}%`; top: `${number}%` }[] = [
  { left: '88%', top: '22%' },
  { left: '8%', top: '22%' },
  { left: '88%', top: '55%' },
  { left: '8%', top: '55%' },
  { left: '42%', top: '12%' },
  { left: '90%', top: '78%' },
];

export function customStarPosition(index: number) {
  return CUSTOM_SLOTS[index % CUSTOM_SLOTS.length];
}
