export type PackAsset = { path: string; blob: Blob };

export type DubLine = {
  id: string;
  character: string;
  caption: string;
  startsAt: number;
  original: PackAsset;
  image?: PackAsset;
  metadataPath: string;
};

export type DubPack = {
  name: string;
  author: string;
  subtitle?: string;
  icon?: PackAsset;
  video: PackAsset;
  backingTrack?: PackAsset;
  lines: DubLine[];
  warnings: string[];
};

export type PackImportResult = { pack?: DubPack; errors: string[] };
