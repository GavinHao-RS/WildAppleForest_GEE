/****
Wild Apple Forest Time-Series Classification (Ili, Xinjiang)
- Train year: 2020
- Apply years: 2020, 2023, 2025
- Model: Random Forest (single model for temporal consistency)
- Region: Ili Kazakh Autonomous Prefecture (Xinjiang, China) clipped by GAUL level 2 admin boundaries
- Features: spectral, vegetation indices, multi-temporal seasonal composites, terrain, texture
- Cloud handling: Sentinel-2 Harmonized + Cloud Score Plus (CSP) with median()
- Classes: 1 Wild Apple Forest (user-provided samples), 2 Other Forest, 3 Cropland, 4 Grassland/Shrub, 5 Urban/Bare, 6 Water/Snow/Ice
- Post-processing: class-1 strict filter with thresholds learned from 2020 samples
- Outputs: yearly classification assets + area and transition summaries

Usage:
1) Import `sample_shp` (wild apple points) in GEE code editor.
2) Set EXPORT_ASSET_ROOT to your GEE asset folder.
****/

// ----------------------- User Config -----------------------
var YEARS = [2020, 2023, 2025];
var TRAIN_YEAR = 2020;
var SCALE = 20;
var CLEAR_THRESHOLD = 0.60;
var RANDOM_SEED = 42;

var EXPORT_ASSET_ROOT = 'users/kindle-400911';
var EXPORT_PREFIX = 'demo_cls_post_yili_20m';

// ----------------------- Region -----------------------
var admin = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'China'))
  .filter(ee.Filter.eq('ADM1_NAME', 'Xinjiang Uygur Zizhiqu'))
  .filter(ee.Filter.eq('ADM2_NAME', 'Ili Kazakh'));
var roi = admin.geometry();

Map.centerObject(roi, 7);

// ----------------------- Data Sources -----------------------
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var srtm = ee.Image('USGS/SRTMGL1_003');
var QA_BAND = 'cs_cdf';

// ----------------------- Utilities -----------------------
function seasonalComposite(year, startMonth, endMonth) {
  var startDate = ee.Date.fromYMD(year, startMonth, 1);
  var endDate = ee.Date.fromYMD(year, endMonth, 1).advance(1, 'month');

  return s2
    .filterBounds(roi)
    .filterDate(startDate, endDate)
    .linkCollection(csPlus, [QA_BAND])
    .map(function(img) {
      return img.updateMask(img.select(QA_BAND).gte(CLEAR_THRESHOLD));
    })
    .median()
    .clip(roi);
}

function addIndices(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  var evi = image.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      NIR: image.select('B8'),
      RED: image.select('B4'),
      BLUE: image.select('B2')
    }).rename('EVI');
  var ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
  var ndbi = image.normalizedDifference(['B11', 'B8']).rename('NDBI');
  var bsi = image.expression(
    '((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))', {
      SWIR: image.select('B11'),
      RED: image.select('B4'),
      NIR: image.select('B8'),
      BLUE: image.select('B2')
    }).rename('BSI');
  var ndmi = image.normalizedDifference(['B8', 'B11']).rename('NDMI');
  return image.addBands([ndvi, evi, ndwi, ndbi, bsi, ndmi]);
}

function addTexture(ndviImage) {
  var gray = ndviImage.multiply(100).toInt16();
  var glcm = gray.glcmTexture({size: 3});
  return glcm.select(
    ['NDVI_contrast', 'NDVI_ent', 'NDVI_idm', 'NDVI_diss', 'NDVI_asm', 'NDVI_var'],
    ['NDVI_tex_contrast', 'NDVI_tex_ent', 'NDVI_tex_idm', 'NDVI_tex_diss', 'NDVI_tex_asm', 'NDVI_tex_var']
  );
}

var terrain = ee.Algorithms.Terrain(srtm)
  .select(['elevation', 'slope'])
  .clip(roi);

function buildFeatureStack(year) {
  var spring = addIndices(seasonalComposite(year, 3, 5));
  var summer = addIndices(seasonalComposite(year, 6, 8));
  var autumn = addIndices(seasonalComposite(year, 9, 11));

  var phenology = summer.select('NDVI').rename('NDVI_peak')
    .addBands(summer.select('EVI').rename('EVI_peak'))
    .addBands(spring.select('NDVI').rename('NDVI_spring'))
    .addBands(autumn.select('NDVI').rename('NDVI_autumn'))
    .addBands(summer.select('NDVI').subtract(autumn.select('NDVI')).rename('NDVI_peak_minus_autumn'))
    .addBands(summer.select('NDVI').subtract(spring.select('NDVI')).rename('NDVI_peak_minus_spring'));

  var spectral = summer
    .select(
      ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8A', 'B8', 'B11', 'B12', 'NDVI', 'EVI', 'NDWI', 'NDBI', 'BSI', 'NDMI'],
      ['B2_su', 'B3_su', 'B4_su', 'B5_su', 'B6_su', 'B7_su', 'B8A_su', 'B8_su', 'B11_su', 'B12_su', 'NDVI_su', 'EVI_su', 'NDWI_su', 'NDBI_su', 'BSI_su', 'NDMI_su']
    )
    .addBands(
      spring.select(
        ['B2', 'B3', 'B4', 'B8', 'NDVI', 'EVI', 'NDWI', 'NDMI'],
        ['B2_sp', 'B3_sp', 'B4_sp', 'B8_sp', 'NDVI_sp', 'EVI_sp', 'NDWI_sp', 'NDMI_sp']
      )
    )
    .addBands(
      autumn.select(
        ['B2', 'B3', 'B4', 'B8', 'NDVI', 'EVI', 'NDWI', 'NDMI'],
        ['B2_au', 'B3_au', 'B4_au', 'B8_au', 'NDVI_au', 'EVI_au', 'NDWI_au', 'NDMI_au']
      )
    );

  var texture = addTexture(summer.select('NDVI'));

  return spectral
    .addBands(phenology)
    .addBands(texture)
    .addBands(terrain)
    .clip(roi);
}

function buildWildAppleSamples() {
  var pts = sample_shp.map(function(f) {
    var lon = ee.Number(f.get('Longitude'));
    var lat = ee.Number(f.get('Latitude'));
    return ee.Feature(ee.Geometry.Point([lon, lat]), f.toDictionary()).set('class', 1);
  });

  var corners = [
    [82.77484146, 43.20874077],
    [82.77116641, 43.2112944],
    [82.77223955, 43.21193612],
    [82.7756369, 43.20940169]
  ];
  var rect = ee.Geometry.Polygon([corners], null, false);
  var rectPts = ee.Image.pixelLonLat().sample({
    region: rect,
    scale: 30,
    geometries: true,
    tileScale: 4
  }).map(function(f) {
    return f.set('class', 1);
  });

  return pts.filterBounds(roi).merge(rectPts);
}

function buildWorldCoverSamples() {
  var worldCover = ee.ImageCollection('ESA/WorldCover/v200');
  var worldCover2021 = ee.Image(ee.Algorithms.If(
    worldCover.filter(ee.Filter.eq('YEAR', 2021)).size().gt(0),
    worldCover.filter(ee.Filter.eq('YEAR', 2021)).first(),
    ee.Algorithms.If(
      worldCover.filter(ee.Filter.eq('year', 2021)).size().gt(0),
      worldCover.filter(ee.Filter.eq('year', 2021)).first(),
      worldCover.first()
    )
  )).select('Map');

  var wcToClass = worldCover2021.remap(
    [10, 20, 30, 40, 50, 60, 70, 80, 90],
    [2, 4, 4, 3, 5, 5, 6, 6, 4]
  ).rename('class').clip(roi);

  return wcToClass.stratifiedSample({
    numPoints: 750,
    classBand: 'class',
    region: roi,
    scale: SCALE,
    tileScale: 4,
    geometries: true,
    classValues: [2, 3, 4, 5, 6],
    classPoints: [150, 150, 150, 150, 150]
  });
}

function prepareTrainingData(sample) {
  var withRand = sample.randomColumn('rand', 1234);
  return {
    training: withRand.filter('rand < 0.7'),
    validation: withRand.filter('rand >= 0.7')
  };
}

function pctDict(fc, band, ps) {
  return ee.Dictionary(fc.reduceColumns({
    reducer: ee.Reducer.percentile(ps),
    selectors: [band]
  }));
}

function learnThresholds(featurestack, allSamples) {
  var feat = featurestack.select(['NDVI_su', 'NDMI_su', 'NDBI_su', 'BSI_su']);
  var samp = feat.sampleRegions({
    collection: allSamples,
    properties: ['class'],
    scale: SCALE,
    tileScale: 8,
    geometries: false
  }).filter(ee.Filter.notNull(['NDVI_su', 'NDMI_su', 'NDBI_su', 'BSI_su', 'class']));

  var class1 = samp.filter(ee.Filter.eq('class', 1));
  var pKeepMin = 60;
  var pKeepMax = 40;

  var ndviP = pctDict(class1, 'NDVI_su', [pKeepMin]);
  var ndmiP = pctDict(class1, 'NDMI_su', [pKeepMin]);
  var ndbiP = pctDict(class1, 'NDBI_su', [pKeepMax]);
  var bsiP = pctDict(class1, 'BSI_su', [pKeepMax]);

  return ee.Dictionary({
    NDVI_min: ee.Number(ndviP.get('p' + pKeepMin)),
    NDMI_min: ee.Number(ndmiP.get('p' + pKeepMin)),
    NDBI_max: ee.Number(ndbiP.get('p' + pKeepMax)),
    BSI_max: ee.Number(bsiP.get('p' + pKeepMax))
  });
}

function postProcessClass1Strict(classified, featurestack, thresholds) {
  var cls = classified.toInt();
  var ndvi = featurestack.select('NDVI_su');
  var ndmi = featurestack.select('NDMI_su');
  var ndbi = featurestack.select('NDBI_su');
  var bsi = featurestack.select('BSI_su');

  var pred1 = cls.eq(1);
  var keep1 = pred1
    .and(ndvi.gte(ee.Number(thresholds.get('NDVI_min'))))
    .and(ndmi.gte(ee.Number(thresholds.get('NDMI_min'))))
    .and(ndbi.lte(ee.Number(thresholds.get('NDBI_max'))))
    .and(bsi.lte(ee.Number(thresholds.get('BSI_max'))));

  var bad1 = pred1.and(keep1.not());
  var urbanLike = pred1.and(
    ndbi.gt(ee.Number(thresholds.get('NDBI_max')))
      .or(bsi.gt(ee.Number(thresholds.get('BSI_max'))))
  );

  var out = cls.where(bad1, 4).where(urbanLike, 5).toInt();

  var minPixels = 150;
  var mask1 = out.eq(1);
  var count1 = mask1.connectedPixelCount(256, true);
  var small1 = mask1.and(count1.lt(minPixels));
  var majority = out.focal_mode({radius: 1, units: 'pixels'});
  out = out.where(small1, majority).toInt();

  return out;
}

function classAreaTable(image, year) {
  var area = ee.Image.pixelArea().divide(1e4).addBands(image.rename('class'));
  var groups = ee.List(area.reduceRegion({
    reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'class'}),
    region: roi,
    scale: SCALE,
    maxPixels: 1e13,
    tileScale: 4
  }).get('groups'));

  return ee.FeatureCollection(groups.map(function(g) {
    g = ee.Dictionary(g);
    return ee.Feature(null, {
      year: year,
      class: g.get('class'),
      area_ha: g.get('sum')
    });
  }));
}

function transitionAreaTable(fromImg, toImg, fromYear, toYear) {
  var trans = fromImg.multiply(10).add(toImg).rename('trans');
  var area = ee.Image.pixelArea().divide(1e4).addBands(trans);
  var groups = ee.List(area.reduceRegion({
    reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'trans'}),
    region: roi,
    scale: SCALE,
    maxPixels: 1e13,
    tileScale: 4
  }).get('groups'));

  return ee.FeatureCollection(groups.map(function(g) {
    g = ee.Dictionary(g);
    var code = ee.Number(g.get('trans'));
    return ee.Feature(null, {
      from_year: fromYear,
      to_year: toYear,
      from_class: code.divide(10).floor(),
      to_class: code.mod(10),
      area_ha: g.get('sum')
    });
  }));
}

function wildAppleChangeMap(fromImg, toImg) {
  return ee.Image(0)
    .where(fromImg.eq(1).and(toImg.neq(1)), 1) // loss
    .where(fromImg.neq(1).and(toImg.eq(1)), 2) // gain
    .where(fromImg.eq(1).and(toImg.eq(1)), 3) // stable wild apple
    .rename('wa_change');
}

// ----------------------- Training on 2020 -----------------------
var trainFeatureStack = buildFeatureStack(TRAIN_YEAR);
var wildAppleSamples = buildWildAppleSamples();
var nonAppleSamples = buildWorldCoverSamples();
var allSamples = nonAppleSamples.merge(wildAppleSamples);

var trainSample = trainFeatureStack.sampleRegions({
  collection: allSamples,
  properties: ['class'],
  scale: SCALE,
  tileScale: 4,
  geometries: false
});

var data = prepareTrainingData(trainSample);
var inputBands = trainFeatureStack.bandNames();

var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 150,
  variablesPerSplit: 6,
  minLeafPopulation: 2,
  bagFraction: 0.7,
  seed: RANDOM_SEED
}).train({
  features: data.training,
  classProperty: 'class',
  inputProperties: inputBands
});

var validated = data.validation.classify(classifier);
var confusion = validated.errorMatrix('class', 'classification');
print('Train year', TRAIN_YEAR, 'confusion matrix', confusion);
print('Train year', TRAIN_YEAR, 'overall accuracy', confusion.accuracy());
print('Train year', TRAIN_YEAR, 'kappa', confusion.kappa());
print('Feature importance', ee.Dictionary(classifier.explain().get('importance')));

var thresholds = learnThresholds(trainFeatureStack, allSamples);
print('Learned class-1 thresholds (from 2020)', thresholds);

// ----------------------- Multi-Year Classification -----------------------
var resultByYear = {};
var palette = ['#b30000', '#00a600', '#f2c649', '#7ab07a', '#8c8c8c', '#3366ff'];

YEARS.forEach(function(year) {
  var fs = buildFeatureStack(year);
  var raw = fs.classify(classifier).rename('classification');
  var post = postProcessClass1Strict(raw, fs, thresholds).toInt().clip(roi);
  resultByYear[String(year)] = post;

  Map.addLayer(post, {min: 1, max: 6, palette: palette}, 'Classification ' + year, false);

  Export.image.toAsset({
    image: post,
    description: EXPORT_PREFIX + '_' + year,
    assetId: EXPORT_ASSET_ROOT + '/' + EXPORT_PREFIX + '_' + year,
    region: roi,
    scale: SCALE,
    maxPixels: 1e13
  });
});

// ----------------------- Time-Series Summaries -----------------------
var areaAll = ee.FeatureCollection([]);
YEARS.forEach(function(year) {
  areaAll = areaAll.merge(classAreaTable(resultByYear[String(year)], year));
});
print('Area summary (ha) for 2020/2023/2025', areaAll);

var t2020_2023 = transitionAreaTable(resultByYear['2020'], resultByYear['2023'], 2020, 2023);
var t2023_2025 = transitionAreaTable(resultByYear['2023'], resultByYear['2025'], 2023, 2025);
var t2020_2025 = transitionAreaTable(resultByYear['2020'], resultByYear['2025'], 2020, 2025);
print('Transition area 2020->2023 (ha)', t2020_2023);
print('Transition area 2023->2025 (ha)', t2023_2025);
print('Transition area 2020->2025 (ha)', t2020_2025);

var wa2020_2025 = wildAppleChangeMap(resultByYear['2020'], resultByYear['2025']);
Map.addLayer(
  wa2020_2025,
  {min: 0, max: 3, palette: ['000000', 'd73027', '1a9850', '4575b4']},
  'Wild Apple Change 2020->2025 (0 other / 1 loss / 2 gain / 3 stable)',
  true
);

// Optional table export:
// Export.table.toDrive({
//   collection: areaAll,
//   description: 'wildapple_area_summary_2020_2023_2025',
//   fileFormat: 'CSV'
// });

