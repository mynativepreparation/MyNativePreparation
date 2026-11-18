import type { AppModule } from '../../core/wire/module';
import { GalleryScreen } from './GalleryScreen';

// Developer tool, reachable at #/gallery only (not in the bottom navigation).
const galleryModule: AppModule = {
  id: 'gallery',
  routes: [{ path: 'gallery', element: <GalleryScreen /> }],
};

export default galleryModule;
