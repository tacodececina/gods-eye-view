import * as Cesium from 'cesium';
import { MapSourceController } from '../maps/controller.js';
/** Public-domain local raster; network-independent and explicitly not live imagery. */
export class EyeinskyMaps extends MapSourceController {
  constructor(viewer, options) {
    const registry = {
      defaultId: 'natural-earth',
      unknownId: 'natural-earth',
      recoveryId: 'ellipsoid',
      state: { hasCesiumIonToken: false },
      sources: [
        {
          descriptor: {
            id: 'natural-earth',
            label: 'Natural Earth · local',
            shortLabel: 'LOCAL',
          },
          imagery: () =>
            Cesium.TileMapServiceImageryProvider.fromUrl(
              Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
            ),
          credit: 'Made with Natural Earth · dominio público',
          constructionFallback: {
            id: 'ellipsoid',
            message: 'Cartografía local no disponible: elipsoide de referencia',
          },
          tileFailureFallback: {
            id: 'ellipsoid',
            threshold: 2,
            message: 'Error de teselas: elipsoide de referencia',
          },
        },
        {
          descriptor: {
            id: 'ellipsoid',
            label: 'Elipsoide · sin cartografía',
            shortLabel: 'SIN MAPA',
          },
          imagery: () =>
            new Cesium.GridImageryProvider({
              cells: 8,
              color: Cesium.Color.fromCssColorString('#38564b'),
              backgroundColor: Cesium.Color.fromCssColorString('#102721'),
              glowWidth: 0,
            }),
          credit: 'Elipsoide WGS84 · no es imagen de observación',
        },
      ],
    };
    super(viewer, { ...options, registry, initialStack: 'natural-earth' });
  }
}
