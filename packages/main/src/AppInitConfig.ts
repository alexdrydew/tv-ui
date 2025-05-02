export type AppInitConfig = {
    isDev: boolean;

    preload: {
        path: string;
    };

    renderer:
        | {
              path: string;
          }
        | URL;
};
