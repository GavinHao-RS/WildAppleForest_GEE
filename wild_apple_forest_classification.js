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

// ----------------------- Region of Interest -----------------------
var admin = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'China'))
  .filter(ee.Filter.eq('ADM1_NAME', 'Xinjiang Uygur Zizhiqu'))
  .filter(ee.Filter.eq('ADM2_NAME', 'Ili Kazakh'));
var roi = admin.geometry();

var trueColorVis = {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000};
var ndviVis = {min: 0, max: 1, palette: ['#d73027', '#fee08b', '#1a9850']};
var cspVis = {bands: ['CSP_CS'], min: 0, max: 100, palette: ['#1a9641', '#ffffbf', '#d7191c']}; // lower = clearer
var textureVis = {min: 0, max: 5, palette: ['#f7fbff', '#6baed6', '#08306b']};
var elevationVis = {min: 0, max: 4000, palette: ['#f7fcb9', '#addd8e', '#31a354', '#006837']};

// ----------------------- Sentinel-2 utilities -----------------------
// Use Harmonized Sentinel-2 with Cloud Score Plus for cloud handling.
var s2Sr = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');
var csp = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');

function addCloudScorePlus(image) {
  var score = csp.filter(ee.Filter.eq('system:index', image.get('system:index'))).first();
  var cs = ee.Image(ee.Algorithms.If(score,
    ee.Image(score).select('cs'),
    ee.Image.constant(100) // default to cloudy if missing
  )).rename('CSP_CS');
  return image.addBands(cs);
}

function maskClouds(image) {
  var cs = image.select('CSP_CS');
  var mask = cs.lt(50); // keep pixels with cloud score < 50 (0-100, lower is clearer)
  return image.updateMask(mask)
    .copyProperties(image, image.propertyNames());
}

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

function seasonalComposite(year, startMonth, endMonth) {
  var start = ee.Date.fromYMD(year, startMonth, 1);
  var end = ee.Date.fromYMD(year, endMonth, 1).advance(1, 'month');

  var s2 = s2Sr.filterDate(start, end)
    .filterBounds(roi)
    .map(addCloudScorePlus)
    .map(maskClouds)
    .map(function(img) { return img.resample('bilinear'); })
    .map(addIndices);

  // Use NDVI-based quality mosaic (highest NDVI pixel) to avoid median composite
  var composite = s2.qualityMosaic('NDVI');
  return composite;
}

function addTexture(baseImage) {
  var gray = baseImage.select('NDVI').multiply(100).toInt();
  var glcm = gray.glcmTexture({size: 3});
  var names = glcm.bandNames();
  var newNames = names.map(function(name) {
    return ee.String(name).replace('NDVI_', 'NDVI_tex_');
  });
  return baseImage.addBands(glcm.rename(newNames));
}

// Terrain features
var srtm = ee.Image('USGS/SRTMGL1_003');
var terrain = ee.Algorithms.Terrain(srtm).select(['elevation', 'slope']);

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

// Noise mitigation: remove small isolated patches (<5 connected pixels) and apply mode filter
var connected = wcToClass.connectedPixelCount(25);
var wcDenoised = wcToClass.updateMask(connected.gte(5))
  .focalMode(1, 'square', 'pixels');

// ----------------------- User-provided wild apple samples -----------------------
// Replace this asset with your own FeatureCollection with property 'class' = 1
var wildAppleSamples = ee.FeatureCollection('users/your_username/wild_apple_samples');

// Example: build wild apple samples from a table plus a small polygon region
// Ensure `table` is an imported FeatureCollection with Longitude/Latitude fields.
var pts = table.map(function(f) {
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
    scale: 10,
    geometries: false,
    tileScale: 4
  })
  .map(function(f) {
    return f.set('class', 1);
  });

var pts_yili = pts.filterBounds(roi).merge(rectPts.filterBounds(roi));
wildAppleSamples = pts_yili;

function stratifiedWorldCoverSamples(region, scale) {
  var sampleImg = wcDenoised.clip(region);
  var stratified = sampleImg.stratifiedSample({
    numPoints: 1000,
    classBand: 'class',
    region: region,
    scale: scale,
    tileScale: 4,
    geometries: false,
    classValues: [2, 3, 4, 5, 6],
    classPoints: [200, 200, 200, 200, 200]
  });
  return stratified;
}

// ----------------------- Feature stack per year -----------------------
function buildFeatureStack(year) {
  var spring = seasonalComposite(year, 3, 5);
  var summer = seasonalComposite(year, 6, 8);
  var autumn = seasonalComposite(year, 9, 11);

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

  var texture = addTexture(summer.select(['NDVI']));

  var featureStack = spectral
    .addBands(phenology)
    .addBands(texture)
    .addBands(terrain);
  return featureStack.clip(roi);
}

// ----------------------- Build features for each year -----------------------
var years = [2020, 2023, 2025];

// ----------------------- Training data -----------------------
function prepareTrainingData(year) {
  var features = buildFeatureStack(year);
  var scale = 20;

  var wcSamples = stratifiedWorldCoverSamples(roi, scale);
  var allSamples = wcSamples.merge(wildAppleSamples);

  var sample = features.sampleRegions({
    collection: allSamples,
    properties: ['class'],
    scale: scale,
    tileScale: 4,
    geometries: false
  });

  // Train/validation split
  var withRand = sample.randomColumn('rand', 1234);
  var training = withRand.filter('rand < 0.7');
  var validation = withRand.filter('rand >= 0.7');

  return {training: training, validation: validation, features: features};
}

// ----------------------- Classification -----------------------
function classifyYear(year) {
  var data = prepareTrainingData(year);
  var bands = data.features.bandNames();

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
  print('Year', year, 'Confusion Matrix', confusion);
  print('Year', year, 'Overall Accuracy', confusion.accuracy());
  print('Year', year, 'Kappa', confusion.kappa());

  // Feature importance
  var importance = ee.Dictionary(classifier.explain().get('importance'));
  print('Year', year, 'Feature importance', importance);

  return classified;
}

// ----------------------- Run for each year -----------------------
var results = years.map(function(y) { return classifyYear(y); });

// ----------------------- Visualization -----------------------
var palette = ['#b30000', '#00a600', '#f2c649', '#7ab07a', '#8c8c8c', '#3366ff'];
var classNames = ['Wild Apple Forest', 'Other Forest', 'Cropland', 'Grass/Shrub', 'Urban/Bare', 'Water/Snow/Ice'];

// Diagnostic layers to visualize intermediate products for a reference year
var previewYear = 2023;
var previewSpring = seasonalComposite(previewYear, 3, 5);
var previewSummer = seasonalComposite(previewYear, 6, 8);
var previewAutumn = seasonalComposite(previewYear, 9, 11);
var previewStack = buildFeatureStack(previewYear);

function invalidPixelPercent(image, region, scale) {
  var bandNames = image.bandNames();
  var sampleSize = 1000;
  var validSample = image.mask().unmask(0).sample({
    region: region,
    scale: scale,
    numPixels: sampleSize,
    seed: 1,
    tileScale: 4
  });

  var meanReducer = ee.Reducer.mean().repeat(bandNames.size());
  var means = validSample.reduceColumns({
    reducer: meanReducer,
    selectors: bandNames
  }).get('mean');

  var stats = bandNames.zip(means).map(function(item) {
    item = ee.List(item);
    var band = ee.String(item.get(0));
    var meanValid = ee.Number(item.get(1));
    var invalidPercent = ee.Number(1).subtract(meanValid).multiply(100);
    return ee.Feature(null, {
      band: band,
      invalid_percent: invalidPercent
    });
  });

  return ee.FeatureCollection(stats);
}

var invalidSummer = invalidPixelPercent(previewSummer, roi, 10);
var invalidStack = invalidPixelPercent(previewStack, roi, 20);
print('Invalid pixel percent (preview summer)', invalidSummer);
print('Invalid pixel percent (preview stack)', invalidStack);

var invalidSummerChart = ui.Chart.feature.byFeature(invalidSummer, 'band', 'invalid_percent')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Invalid pixel percent per band (preview summer)',
    hAxis: {title: 'Band'},
    vAxis: {title: 'Invalid %'},
    legend: {position: 'none'}
  });
print(invalidSummerChart);

var invalidStackChart = ui.Chart.feature.byFeature(invalidStack, 'band', 'invalid_percent')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Invalid pixel percent per band (preview stack)',
    hAxis: {title: 'Band'},
    vAxis: {title: 'Invalid %'},
    legend: {position: 'none'}
  });
print(invalidStackChart);

Map.addLayer(previewSpring.select('CSP_CS').clip(roi), cspVis, 'CSP score spring ' + previewYear, false);
Map.addLayer(previewSpring.select(trueColorVis.bands).clip(roi), trueColorVis, 'Spring true color ' + previewYear, false);
Map.addLayer(previewSpring.select('NDVI').clip(roi), ndviVis, 'Spring NDVI ' + previewYear, false);

Map.addLayer(previewSummer.select(trueColorVis.bands).clip(roi), trueColorVis, 'Summer true color ' + previewYear, false);
Map.addLayer(previewSummer.select('NDVI').clip(roi), ndviVis, 'Summer NDVI ' + previewYear, false);

Map.addLayer(previewAutumn.select(trueColorVis.bands).clip(roi), trueColorVis, 'Autumn true color ' + previewYear, false);
Map.addLayer(previewAutumn.select('NDVI').clip(roi), ndviVis, 'Autumn NDVI ' + previewYear, false);

Map.addLayer(previewStack.select('NDVI_tex_contrast').clip(roi), textureVis, 'NDVI texture contrast ' + previewYear, false);
Map.addLayer(previewStack.select('elevation').clip(roi), elevationVis, 'Elevation (SRTM)', false);
Map.addLayer(previewStack.select('NDVI_peak_minus_autumn').clip(roi), {min: -0.5, max: 0.5, palette: ['#4575b4', '#ffffbf', '#d73027']}, 'Phenology peak-autumn NDVI ' + previewYear, false);
Map.addLayer(previewStack.select('NDVI_peak_minus_spring').clip(roi), {min: -0.5, max: 0.5, palette: ['#4575b4', '#ffffbf', '#d73027']}, 'Phenology peak-spring NDVI ' + previewYear, false);

results.forEach(function(img, idx) {
  var year = years[idx];
  Map.addLayer(img.clip(roi), {min: 1, max: 6, palette: palette}, 'Classification ' + year, false);
});

Map.addLayer(roi, {color: 'red'}, 'ROI', false);
Map.centerObject(roi, 5);

// Comparison mosaic
var compositeComparison = ee.ImageCollection(results)
  .toBands()
  .rename(['class_2020', 'class_2023', 'class_2025']);
Map.addLayer(compositeComparison.clip(roi), {min: 1, max: 6, palette: palette}, 'Comparison (bands per year)', false);

// Export examples
function exportResult(image, year) {
  Export.image.toDrive({
    image: image.toInt(),
    description: 'WildAppleRF_' + year,
    folder: 'GEE_exports',
    fileNamePrefix: 'wildapple_rf_' + year,
    region: roi,
    scale: 10,
    maxPixels: 1e13
  });
}

years.forEach(function(y, idx) { exportResult(ee.Image(results[idx]), y); });
