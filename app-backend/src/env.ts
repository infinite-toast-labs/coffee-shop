export type Bindings = {
  DB: D1Database;
  CACHE: KVNamespace;
  ASSETS: R2Bucket;
  APP_ORIGIN: string;
  API_ORIGIN: string;
};

export type AppEnv = {
  Bindings: Bindings;
};
