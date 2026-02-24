/****
Example: Wild Apple Forest Classification over Ili Prefecture (Xinjiang, China) using Sentinel-2 and Random Forest
- Years: 2020, 2023, 2025
- Region: Ili Kazakh Autonomous Prefecture (Xinjiang, China) clipped by GAUL level 2 admin boundaries
- Features: spectral, vegetation indices, multi-temporal seasonal composites, terrain, texture
- Cloud handling: Sentinel-2 Harmonized + Cloud Score Plus (CSP) with quality mosaic (NDVI) to avoid .median()
- Classes: 1 Wild Apple Forest (user-provided samples), 2 Other Forest, 3 Cropland, 4 Grassland/Shrub, 5 Urban/Bare, 6 Water/Snow/Ice
- Non–wild-apple samples: automatically derived from ESA WorldCover 10 m 2021 with noise mitigation
- Outputs: classified maps for each year, accuracy assessment, feature importance, and visual comparison

****/
//import the wa samples here first and renamed 'sample_shp'
// ----------------------- Region of Interest(ili Kazakh) -----------------------
var admin = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'China'))
  .filter(ee.Filter.eq('ADM1_NAME', 'Xinjiang Uygur Zizhiqu'))
  .filter(ee.Filter.eq('ADM2_NAME', 'Ili Kazakh'));
var roi = admin.geometry();

// ----------------------- Visgrams -----------------------------
var trueColorVis = {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000, gamma: 1.2};
var ndviVis = {min: 0, max: 1, palette: ['#d73027', '#fee08b', '#1a9850']};
// var cspVis = {bands: ['CSP_CS'], min: 0, max: 100, palette: ['#1a9641', '#ffffbf', '#d7191c']}; // lower = clearer
var textureVis = {min: 0, max: 5, palette: ['#f7fbff', '#6baed6', '#08306b']};
var elevationVis = {min: 0, max: 4000, palette: ['#f7fcb9', '#addd8e', '#31a354', '#006837']};

// ------------ Sentinel-2 utilities and Remove Cloud via csP -----------------------
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var QA_BAND = 'cs_cdf';
// The threshold for masking; values between 0.50 and 0.65 generally work well.
// Higher values will remove thin clouds, haze & cirrus shadows.
var CLEAR_THRESHOLD = 0.60;

function seasonalComposite(year, startMonth, endMonth) {
  var startDate = ee.Date.fromYMD(year, startMonth, 1);
  var endDate = ee.Date.fromYMD(year, endMonth, 1).advance(1, 'month');

  var composite = s2
    .filterBounds(roi)
    .filterDate(startDate, endDate)
    .linkCollection(csPlus, [QA_BAND])
    .map(function(img) {
      return img.updateMask(img.select(QA_BAND).gte(CLEAR_THRESHOLD));
    })
    .median();
    
  return composite;
}
// ------------ Prepare the featurestack(year:2020,2023,2025) -----------------------
var year = 2020;
var spring = seasonalComposite(year, 3, 5).clip(roi);
var summer = seasonalComposite(year, 6, 8).clip(roi);
var autumn = seasonalComposite(year, 9, 11).clip(roi);

// Map.addLayer(spring, trueColorVis, 'spring median composite',false);
// Map.addLayer(summer, trueColorVis, 'summer median composite',false);
// Map.addLayer(autumn, trueColorVis, 'autumn median composite',false);
// Map.centerObject(roi, 7);

function addIndices(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  var evi = image.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'BLUE': image.select('B2')
    }).rename('EVI');
  var ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
  return image.addBands([ndvi, evi, ndwi]);
}

function addTexture(baseImage) {
  var gray = baseImage.select('NDVI').multiply(100).toInt();
  var glcm = gray.glcmTexture({size: 3});
  var names = glcm.bandNames();
  var newNames = names.map(function(name) {
    return ee.String(name).replace('NDVI_', 'NDVI_tex_');
  });
  var texture = glcm.rename(newNames).select([
    'NDVI_tex_contrast',
    'NDVI_tex_ent',
    'NDVI_tex_idm',
    'NDVI_tex_diss',
    'NDVI_tex_asm',
    'NDVI_tex_var'
  ]);
  return baseImage.addBands(texture);
}
var spring = addIndices(spring);
var summer = addIndices(summer);
var autumn = addIndices(autumn);

var texture = addTexture(summer.select(['NDVI']));
//Map.addLayer(texture, {bands: ['NDVI_tex_contrast', 'NDVI_tex_ent', 'NDVI_tex_asm'], min: 0, max: 3000, gamma: 1.2}, 'summer NDVI texture',false);
//Map.centerObject(roi, 7);

var srtm = ee.Image('USGS/SRTMGL1_003');
var terrain = ee.Algorithms.Terrain(srtm).select(['elevation', 'slope']).clip(roi);

var phenology = summer.select('NDVI').rename('NDVI_peak')
    .addBands(summer.select('EVI').rename('EVI_peak'))
    .addBands(spring.select('NDVI').rename('NDVI_spring'))
    .addBands(autumn.select('NDVI').rename('NDVI_autumn'))
    .addBands(
      summer.select('NDVI').subtract(autumn.select('NDVI')).rename('NDVI_peak_minus_autumn'))
    .addBands(
      summer.select('NDVI').subtract(spring.select('NDVI')).rename('NDVI_peak_minus_spring'));

var spectral = summer.select(['B2','B3','B4','B8','NDVI','EVI','NDWI'])
    .rename(['B2_su','B3_su','B4_su','B8_su','NDVI_su','EVI_su','NDWI_su'])
    .addBands(spring.select(['B2','B3','B4','B8','NDVI','EVI','NDWI'])
      .rename(['B2_sp','B3_sp','B4_sp','B8_sp','NDVI_sp','EVI_sp','NDWI_sp']))
    .addBands(autumn.select(['B2','B3','B4','B8','NDVI','EVI','NDWI'])
      .rename(['B2_au','B3_au','B4_au','B8_au','NDVI_au','EVI_au','NDWI_au']));

// Map.addLayer(phenology, {bands: ['NDVI_peak', 'EVI_peak', 'NDVI_spring'], min: 0, max: 3000, gamma: 1.2}, 'phenology composite',false);
// Map.addLayer(spectral, {bands: ['B4_su', 'B3_su', 'B2_su'], min: 0, max: 3000, gamma: 1.2}, 'spectral composite',false);
// Map.centerObject(roi, 7);

var featurestack = spectral
    .addBands(phenology)
    .addBands(texture)
    .addBands(terrain)
    .clip(roi);
//Map.addLayer(featurestack, {bands: ['B4_su', 'B3_su', 'B2_su'], min: 0, max: 3000, gamma: 1.2}, 'spectral composite',false);
// Map.addLayer(featurestack.select(0),{}, 'B2_su',false);
// Map.addLayer(featurestack.select(1),{}, 'B3_su',false);
// Map.addLayer(featurestack.select(2),{}, 'B4_su',false);
// Map.addLayer(featurestack.select(3),{}, 'B8_su',false);
// Map.addLayer(featurestack.select(4),{}, 'NDVI_su',false);
// Map.addLayer(featurestack.select(5),{}, 'EVI_su',false);
// Map.addLayer(featurestack.select(6),{}, 'NDWI_su',false);
// Map.addLayer(featurestack.select(7),{}, 'B2_sp',false);
// Map.addLayer(featurestack.select(8),{}, 'B3_sp',false);
// Map.addLayer(featurestack.select(9),{}, 'B4_sp',false);
// Map.addLayer(featurestack.select(10),{}, 'B8_sp',false);
// Map.addLayer(featurestack.select(11),{}, 'NDVI_sp',false);
// Map.addLayer(featurestack.select(12),{}, 'EVI_sp',false);
// Map.addLayer(featurestack.select(13),{}, 'NDWI_sp',false);
// Map.addLayer(featurestack.select(14),{}, 'B2_au',false);
// Map.addLayer(featurestack.select(15),{}, 'B3_au',false);
// Map.addLayer(featurestack.select(16),{}, 'B4_au',false);
// Map.addLayer(featurestack.select(17),{}, 'B8_au',false);
// Map.addLayer(featurestack.select(18),{}, 'NDVI_au',false);
// Map.addLayer(featurestack.select(19),{}, 'EVI_au',false);
// Map.addLayer(featurestack.select(20),{}, 'NDWI_au',false);
// Map.addLayer(featurestack.select(21),{}, 'NDVI_peak',false);
// Map.addLayer(featurestack.select(22),{}, 'EVI_peak',false);
// Map.addLayer(featurestack.select(23),{}, 'NDVI_spring',false);
// Map.addLayer(featurestack.select(24),{}, 'NDVI_autumn',false);
// Map.addLayer(featurestack.select(25),{}, 'NDVI_peak_minus_autumn',false);
// Map.addLayer(featurestack.select(26),{}, 'NDVI_peak_minus_spring',false);
// Map.addLayer(featurestack.select(27),{}, 'NDVI',false);
// Map.addLayer(featurestack.select(28),{}, 'NDVI_tex_contrast',false);
// Map.addLayer(featurestack.select(29),{}, 'NDVI_tex_ent',false);
// Map.addLayer(featurestack.select(30),{}, 'NDVI_tex_idm',false);
// Map.addLayer(featurestack.select(31),{}, 'NDVI_tex_diss',false);
// Map.addLayer(featurestack.select(32),{}, 'NDVI_tex_asm',false);
// Map.addLayer(featurestack.select(33),{}, 'NDVI_tex_var',false);
// Map.addLayer(featurestack.select(34),{}, 'elevation',false);
// Map.addLayer(featurestack.select(35),{}, 'slope',false);

// Map.centerObject(roi, 7);

// // ------------------ Prepare the training data ------------------------
var pts = sample_shp.map(function(f) {
  var lon = ee.Number(f.get('Longitude'));
  var lat = ee.Number(f.get('Latitude'));
  return ee.Feature(
    ee.Geometry.Point([lon, lat]),
    f.toDictionary()
  ).set('class', 1);
});

var corners = [
  [82.77484146, 43.20874077],
  [82.77116641, 43.2112944],
  [82.77223955, 43.21193612],
  [82.7756369, 43.20940169]
];
var rect = ee.Geometry.Polygon([corners], null, false);
var rectPts = ee.Image.pixelLonLat()
  .sample({
    region: rect,
    scale: 30,
    geometries: false,
    tileScale: 4
  })
  .map(function(f){
    return f.set('class', 1);
  });

var wildAppleSamples = pts.filterBounds(roi).merge(rectPts);//ili's sample pts, class = 1
// print('wildAppleSamples size', wildAppleSamples.size());
// print('input geom type:', wildAppleSamples.first().geometry().type());
// Map.addLayer(wildAppleSamples, {}, 'Samples');

var scale = 20;
// var wsample = featurestack.sampleRegions({
//   collection: wildAppleSamples,
//   properties: ['class'],
//   scale: scale,
//   tileScale: 4,
//   geometries: false
// });
// print('sample size:', wsample.size());
// Map.addLayer(sample, {color: 'yellow'}, 'Sample points');

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

// Map WorldCover classes to our scheme (excluding wild apple = 1)
var wcToClass = worldCover2021.remap(
  [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100, 111, 112, 200], // source
  [5, 3, 2, 5, 5, 5, 5, 6, 4, 4, 6, 4, 4, 6] // target classes
).rename('class');
wcToClass = wcToClass.clip(roi);
var wcSamples = wcToClass.stratifiedSample({
    numPoints: 750,
    classBand: 'class',
    region: roi,
    scale: scale,
    tileScale: 4,
    geometries: true,
    classValues: [2, 3, 4, 5, 6],
    classPoints: [150, 150, 150, 150, 150]
  });
// print('stratified size', wcSamples.size());
// print('stratified class histogram', wcSamples.aggregate_histogram('class'));
// Map.addLayer(wcSamples, {}, 'Sample points',false);

// var wcsample = featurestack.sampleRegions({
//   collection: wcSamples,
//   properties: ['class'],
//   scale: scale,
//   tileScale: 4,
//   geometries: false
// });
// print('wcsample size:', wcsample.size());
// Map.addLayer(wcsample, {}, 'wcsample points');

var allSamples = wcSamples.merge(wildAppleSamples);
// print('sample size', allSamples.size());
// print('class histogram', allSamples.aggregate_histogram('class'));
// Map.addLayer(allSamples, {}, 'Sample points',false);

var sample = featurestack.sampleRegions({
  collection: allSamples,
  properties: ['class'],
  scale: scale,
  tileScale: 4,
  geometries: false
});
//print('sample size:', sample.size());
//Map.addLayer(wcsample, {}, 'wcsample points');

// ----------------------- Training data -----------------------
function prepareTrainingData(sample,features) {
  // Train/validation split
  var withRand = sample.randomColumn('rand', 1234);
  var training = withRand.filter('rand < 0.7');
  var validation = withRand.filter('rand >= 0.7');

  return {training: training, validation: validation, features: features};
}

// ----------------------- Classification -----------------------
var data = prepareTrainingData(sample,featurestack);
var bands = data.features.bandNames();
//print(bands);

var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 150,
  variablesPerSplit: 6,
  minLeafPopulation: 2,
  bagFraction: 0.7,
  seed: 42
}).train({
  features: data.training,
  classProperty: 'class',
  inputProperties: bands
});

var classified = data.features.classify(classifier).rename('classification');
// Accuracy
var validated = data.validation.classify(classifier);
var confusion = validated.errorMatrix('class', 'classification');
// print('Year', year, 'Confusion Matrix', confusion);
// print('Year', year, 'Overall Accuracy', confusion.accuracy());
// print('Year', year, 'Kappa', confusion.kappa());

// Feature importance
var importance = ee.Dictionary(classifier.explain().get('importance'));
//print('Year', year, 'Feature importance', importance);

var palette = ['#b30000', '#00a600', '#f2c649', '#7ab07a', '#8c8c8c', '#3366ff'];
var classNames = ['Wild Apple Forest', 'Other Forest', 'Cropland', 'Grass/Shrub', 'Urban/Bare', 'Water/Snow/Ice'];
Map.addLayer(classified.clip(roi), {min: 1, max: 6, palette: palette}, 'Classification ', false);
