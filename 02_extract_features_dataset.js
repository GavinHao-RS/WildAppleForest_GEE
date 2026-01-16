/****
Step 2: Sample features from exported feature stacks and build training/validation datasets.
- Inputs: feature stack assets from Step 1.
- Outputs: training/validation FeatureCollections exported to Assets.
****/

// ----------------------- Region of Interest -----------------------
var admin = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'China'))
  .filter(ee.Filter.eq('ADM1_NAME', 'Xinjiang Uygur Zizhiqu'))
  .filter(ee.Filter.eq('ADM2_NAME', 'Ili Kazakh'));
var roi = admin.geometry();

// ----------------------- WorldCover-derived samples -----------------------
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
  [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100, 111, 112, 200],
  [5, 3, 2, 5, 5, 5, 5, 6, 4, 4, 6, 4, 4, 6]
).rename('class');

var connected = wcToClass.connectedPixelCount(25);
var wcDenoised = wcToClass.updateMask(connected.gte(5))
  .focalMode(1, 'square', 'pixels');

// ----------------------- User-provided wild apple samples -----------------------
// Replace with your own FeatureCollection (class = 1)
var wildAppleSamples = ee.FeatureCollection('users/your_username/wild_apple_samples');

function stratifiedWorldCoverSamples(region, scale) {
  var sampleImg = wcDenoised.clip(region);
  return sampleImg.stratifiedSample({
    numPoints: 1000,
    classBand: 'class',
    region: region,
    scale: scale,
    tileScale: 4,
    geometries: false,
    classValues: [2, 3, 4, 5, 6],
    classPoints: [200, 200, 200, 200, 200]
  });
}

function buildSamples(featureImage) {
  var scale = 20;
  var wcSamples = stratifiedWorldCoverSamples(roi, scale);
  var allSamples = wcSamples.merge(wildAppleSamples);

  var sample = featureImage.sampleRegions({
    collection: allSamples,
    properties: ['class'],
    scale: scale,
    tileScale: 4,
    geometries: false
  });

  var withRand = sample.randomColumn('rand', 1234);
  var training = withRand.filter('rand < 0.7');
  var validation = withRand.filter('rand >= 0.7');

  return {training: training, validation: validation};
}

var years = [2020, 2023, 2025];

years.forEach(function(year) {
  var featureImage = ee.Image('users/your_username/wildapple/features_' + year);
  var samples = buildSamples(featureImage);

  Export.table.toAsset({
    collection: samples.training,
    description: 'WildApple_Train_' + year,
    assetId: 'users/your_username/wildapple/training_' + year
  });

  Export.table.toAsset({
    collection: samples.validation,
    description: 'WildApple_Valid_' + year,
    assetId: 'users/your_username/wildapple/validation_' + year
  });
});

Map.addLayer(roi, {color: 'red'}, 'ROI', false);
Map.centerObject(roi, 6);
