interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_PREVIEW_SAFE_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
