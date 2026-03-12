export type CursorTool = 'select' | 'hand';
export type ScrollMode = 'vertical' | 'horizontal' | 'wrapped';
export type SpreadMode = 'none' | 'odd' | 'even';

export interface PreviewFeatures {
  externalLinks: boolean;
  openFile: boolean;
  download: boolean;
  print: boolean;
  documentProperties: boolean;
  currentView: boolean;
  forms: boolean;
  annotationEditing: boolean;
}

export interface PreviewDefaults {
  cursor: CursorTool;
  scale: string;
  sidebar: boolean;
  scrollMode: ScrollMode;
  spreadMode: SpreadMode;
}

export interface PreviewWebviewSettings {
  cMapUrl: string;
  iccUrl: string;
  imageResourcesPath: string;
  runtime: PreviewRuntimeValues;
  sandboxBundleSrc: string;
  standardFontDataUrl: string;
  wasmUrl: string;
  workerSrc: string;
  path: string;
  features: PreviewFeatures;
  defaults: PreviewDefaults;
}

export interface PreviewRuntimeValues {
  annotationEditorModeDisable: number;
  annotationEditorModeNone: number;
  annotationModeEnable: number;
  annotationModeEnableForms: number;
}

export const PREVIEW_FEATURE_DEFAULTS: Readonly<PreviewFeatures> = {
  externalLinks: false,
  openFile: false,
  download: false,
  print: false,
  documentProperties: false,
  currentView: false,
  forms: false,
  annotationEditing: false,
};

export const PREVIEW_FEATURE_NAMES = Object.freeze(
  Object.keys(PREVIEW_FEATURE_DEFAULTS) as (keyof PreviewFeatures)[],
);

export const PREVIEW_RUNTIME_VALUES: Readonly<PreviewRuntimeValues> = {
  annotationEditorModeDisable: -1,
  annotationEditorModeNone: 0,
  annotationModeEnable: 1,
  annotationModeEnableForms: 2,
};

export function getPreviewFeatureSettingKey(
  featureName: keyof PreviewFeatures,
): string {
  return `pdf-preview.features.${featureName}`;
}

export function resolvePreviewFeatures(
  getSetting: (settingName: string) => boolean | undefined,
): PreviewFeatures {
  const features = {} as PreviewFeatures;

  for (const featureName of PREVIEW_FEATURE_NAMES) {
    features[featureName] =
      getSetting(`features.${featureName}`) ??
      PREVIEW_FEATURE_DEFAULTS[featureName];
  }

  return features;
}
