import fs from 'node:fs';
import path from 'node:path';

const dataDirectory = path.resolve('public/map-data');
const readGeoJson = (name) => JSON.parse(
  fs.readFileSync(path.join(dataDirectory, name), 'utf8'),
);

const roundCoordinate = (value) => Math.round(Number(value) * 1e6) / 1e6;
const compactCoordinates = (coordinates) => {
  if (!Array.isArray(coordinates)) return coordinates;
  if (coordinates.length >= 2 && coordinates.every(Number.isFinite)) {
    return [roundCoordinate(coordinates[0]), roundCoordinate(coordinates[1])];
  }
  return coordinates.map(compactCoordinates);
};

const collectLines = (geometry, target) => {
  if (!geometry) return;
  if (geometry.type === 'LineString') target.push(compactCoordinates(geometry.coordinates));
  if (geometry.type === 'MultiLineString') {
    geometry.coordinates.forEach((line) => target.push(compactCoordinates(line)));
  }
  if (geometry.type === 'GeometryCollection') {
    geometry.geometries.forEach((item) => collectLines(item, target));
  }
};

const collectPolygons = (geometry, target) => {
  if (!geometry) return;
  if (geometry.type === 'Polygon') target.push(compactCoordinates(geometry.coordinates));
  if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((polygon) => target.push(compactCoordinates(polygon)));
  }
  if (geometry.type === 'GeometryCollection') {
    geometry.geometries.forEach((item) => collectPolygons(item, target));
  }
};

const lineLength = (line) => line.reduce((total, point, index) => {
  if (index === 0) return total;
  const previous = line[index - 1];
  return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
}, 0);

const midpoint = (line) => line[Math.floor(line.length / 2)];

const roadsSource = readGeoJson('overture-roads.geojson');
const roads = {};
const roadLabelCandidates = new Map();

roadsSource.features.forEach((feature) => {
  const roadClass = feature.properties?.class || 'residential';
  roads[roadClass] ||= [];
  const lines = [];
  collectLines(feature.geometry, lines);
  roads[roadClass].push(...lines);

  const name = String(feature.properties?.name || '').trim();
  if (!name) return;
  lines.forEach((line) => {
    if (line.length < 2) return;
    const point = midpoint(line);
    const gridKey = `${name.toLocaleLowerCase('es-MX')}:${Math.floor(point[0] / 0.018)}:${Math.floor(point[1] / 0.018)}`;
    const length = lineLength(line);
    const current = roadLabelCandidates.get(gridKey);
    if (!current || length > current.length) {
      roadLabelCandidates.set(gridKey, { name, coordinates: point, roadClass, length });
    }
  });
});

const landUseSource = readGeoJson('overture-land-use.geojson');
const landUse = {};
landUseSource.features.forEach((feature) => {
  const landClass = feature.properties?.class || 'other';
  landUse[landClass] ||= [];
  collectPolygons(feature.geometry, landUse[landClass]);
});

const waterSource = readGeoJson('overture-water.geojson');
const water = { polygons: [], lines: [] };
waterSource.features.forEach((feature) => {
  collectPolygons(feature.geometry, water.polygons);
  collectLines(feature.geometry, water.lines);
});

const labelsSource = readGeoJson('overture-labels.geojson');
const labels = labelsSource.features
  .filter((feature) => feature.geometry?.type === 'Point' && feature.properties?.name)
  .map((feature) => ({
    name: feature.properties.name,
    subtype: feature.properties.subtype,
    prominence: feature.properties.prominence,
    coordinates: compactCoordinates(feature.geometry.coordinates),
  }));

const output = {
  release: '2026-08-19.0',
  bounds: [-89.75, 20.86, -89.52, 21.08],
  roads,
  roadLabels: [...roadLabelCandidates.values()].map(({ length: _length, ...label }) => label),
  landUse,
  water,
  labels,
};

fs.writeFileSync(
  path.join(dataDirectory, 'overture-merida-basemap.json'),
  JSON.stringify(output),
);
