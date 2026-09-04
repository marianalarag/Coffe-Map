INSTALL spatial;
LOAD spatial;
INSTALL httpfs;
LOAD httpfs;

SET s3_region = 'us-west-2';

-- Coffee Map intentionally exports only the fixed Merida coverage area.
COPY (
  SELECT names.primary AS name, class, geometry
  FROM read_parquet(
    's3://overturemaps-us-west-2/release/2026-08-19.0/theme=transportation/type=segment/*',
    filename = true,
    hive_partitioning = 1
  )
  WHERE subtype = 'road'
    AND class IN (
      'trunk', 'primary', 'secondary', 'tertiary',
      'residential', 'unclassified', 'living_street', 'pedestrian'
    )
    AND bbox.xmin >= -89.75
    AND bbox.xmax <= -89.52
    AND bbox.ymin >= 20.86
    AND bbox.ymax <= 21.08
) TO 'public/map-data/overture-roads.geojson'
  WITH (FORMAT GDAL, DRIVER 'GeoJSON', SRS 'EPSG:4326');

COPY (
  SELECT names.primary AS name, class, geometry
  FROM read_parquet(
    's3://overturemaps-us-west-2/release/2026-08-19.0/theme=base/type=land_use/*',
    filename = true,
    hive_partitioning = 1
  )
  WHERE class IN (
      'park', 'grass', 'garden', 'playground', 'recreation_ground',
      'school', 'college', 'university', 'kindergarten',
      'hospital', 'commercial', 'retail', 'industrial', 'cemetery'
    )
    AND bbox.xmin >= -89.75
    AND bbox.xmax <= -89.52
    AND bbox.ymin >= 20.86
    AND bbox.ymax <= 21.08
) TO 'public/map-data/overture-land-use.geojson'
  WITH (FORMAT GDAL, DRIVER 'GeoJSON', SRS 'EPSG:4326');

COPY (
  SELECT names.primary AS name, subtype, class, geometry
  FROM read_parquet(
    's3://overturemaps-us-west-2/release/2026-08-19.0/theme=base/type=water/*',
    filename = true,
    hive_partitioning = 1
  )
  WHERE bbox.xmin >= -89.75
    AND bbox.xmax <= -89.52
    AND bbox.ymin >= 20.86
    AND bbox.ymax <= 21.08
) TO 'public/map-data/overture-water.geojson'
  WITH (FORMAT GDAL, DRIVER 'GeoJSON', SRS 'EPSG:4326');

COPY (
  SELECT names.primary AS name, subtype, cartography.prominence AS prominence, geometry
  FROM read_parquet(
    's3://overturemaps-us-west-2/release/2026-08-19.0/theme=divisions/type=division/*',
    filename = true,
    hive_partitioning = 1
  )
  WHERE subtype IN ('locality', 'neighborhood')
    AND bbox.xmin BETWEEN -89.75 AND -89.52
    AND bbox.ymin BETWEEN 20.86 AND 21.08
) TO 'public/map-data/overture-labels.geojson'
  WITH (FORMAT GDAL, DRIVER 'GeoJSON', SRS 'EPSG:4326');
