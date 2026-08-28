// xoxo/config/captions/captionPickers.ts
//
// Barrel re-export for all caption pickers and supporting types.
// Import everything you need from here instead of reaching into individual files.
//
// Example:
//   import { pickCuteCaption, pickGayCaption } from '../../config/captions/captionPickers.js';

export type { CaptionBand }                                     from './ratingCaptionUtils.js';
export { pickBandedCaption }                                    from './ratingCaptionUtils.js';

export { autisticCaptionBands, rareAutisticCaption,
         infiniteAutisticCaption, pickAutisticCaption }         from './autisticCaptions.js';

export type { CuteCaptionBand }                                 from './cuteCaptions.js';
export { cuteCaptionBands, rareCuteCaption,
         infiniteCuteCaption, pickCuteCaption }                 from './cuteCaptions.js';

export { gayCaptionBands, rareGayCaption,
         infiniteGayCaption, pickGayCaption }                   from './gayCaptions.js';

export { intelligenceCaptionBands, rareIntelligenceCaption,
         infiniteIntelligenceCaption, pickIntelligenceCaption } from './intelligenceCaptions.js';

export { rizzCaptionBands, rareRizzCaption,
         infiniteRizzCaption, pickRizzCaption }                 from './rizzCaptions.js';

export type { ShipCaptionBand }                                 from './shipCaptions.js';
export { shipCaptionBands, selfShipCaptions,
         pickCaption, pickSelfCaption }                         from './shipCaptions.js';

export { simpCaptionBands, rareSimpCaption,
         infiniteSimpCaption, pickSimpCaption }                 from './simpCaptions.js';

export { pickWhoWouldWinCaption }                               from './whoWouldWinCaptions.js';
export { getWhoWouldWinBotCaption }                             from './whoWouldWinCaptions.js';
