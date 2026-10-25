// soma-play's print part: PlayMaker's own PDF writer, unchanged.
// Bundled by scripts/bundle-playmaker.mjs from PlayMaker's source (eldrgeek/playmaker),
// into src/playmaker/print.js. Nothing here is rewritten: fountainToStagePlay reads
// the scene, and stagePlayDocumentToPdf lays it out in Diana's house style with pdf-lib.
import { fountainToStagePlay } from '@/lib/stagePlay';
import { stagePlayDocumentToPdf } from '@/lib/stagePlayPdf';

export { fountainToStagePlay, stagePlayDocumentToPdf };

/** A scene or a whole play, as PlayMaker's Fountain, to PDF bytes in Diana's format. */
export async function scriptToPdf(
  source: string,
  options: { title?: string; author?: string } = {},
): Promise<Uint8Array> {
  const doc = fountainToStagePlay(source, { houseStyle: 'diana-wyenn', title: options.title, author: options.author });
  return stagePlayDocumentToPdf(doc, 'diana-wyenn');
}
