export type RatingContext = 'gay' | 'cute' | 'rizz' | 'intelligent' | 'autistic' | 'simp';

// Add one direct image URL per context. The renderer falls back to a neutral
// background when a URL is empty or cannot be loaded.
export const ratingBackgrounds: Record<RatingContext, string> = {
  gay: 'https://i.ibb.co/tMQZ2tG6/howgay.jpg',
  cute: 'https://i.ibb.co/7tYGnP8Y/howcute.jpg',
  rizz: 'https://i.ibb.co/gZqJY3fL/howrizz.jpg',
  intelligent: 'https://i.ibb.co/DD6zwtY8/howintelligent.jpg',
  autistic: 'https://i.ibb.co/NghDth39/howautistic.jpg',
  simp: 'https://i.ibb.co/sJd0L7vL/howsimp.jpg',
};