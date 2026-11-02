import CafeMapPreview from './CafeMapPreview';

export default function AdminMapPreview({ lat, lng }) {
  return <><CafeMapPreview lat={lat} lng={lng} /><small className="cms-map-credits">Mapa: <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></small></>;
}
