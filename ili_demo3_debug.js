/****
Example: Wild Apple Forest Classification over Ili Prefecture (Xinjiang, China) using Sentinel-2 and Random Forest
- Years: 2020, 2023, 2025
- Region: Ili Kazakh Autonomous Prefecture (Xinjiang, China) clipped by GAUL level 2 admin boundaries
- Features: spectral, vegetation indices, multi-temporal seasonal composites, terrain, texture
- Cloud handling: Sentinel-2 Harmonized + Cloud Score Plus (CSP) with median()
- Classes: 1 Wild Apple Forest (user-provided samples), 2 Other Forest, 3 Cropland, 4 Grassland/Shrub, 5 Urban/Bare, 6 Water/Snow/Ice
- Non–wild-apple samples: automatically derived from ESA WorldCover 10 m 2021 with noise mitigation
- Outputs: classified maps for each year, accuracy assessment, feature importance, and visual comparison
===== FIX: force a metric projection before median() to avoid EPSG:4326 1-degree grid =====
****/
//var sample_shp: Table projects/kindle-400911/assets/wildapple_sample // import the groundtruth WAF asset to gee
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

// ===== FIX: force a metric projection before median() to avoid EPSG:4326 1-degree grid =====
var PROJ = ee.Projection('EPSG:3857').atScale(20);
function seasonalComposite(year, startMonth, endMonth) {
  var startDate = ee.Date.fromYMD(year, startMonth, 1);
  var endDate = ee.Date.fromYMD(year, endMonth, 1).advance(1, 'month');

  var composite = s2
    .filterBounds(roi)
    .filterDate(startDate, endDate)
    .linkCollection(csPlus, [QA_BAND])
    .map(function(img) {
      img = img.updateMask(img.select(QA_BAND).gte(CLEAR_THRESHOLD));
      return img.resample('bilinear').reproject(PROJ);// reproject ° to m, epsg:4326 to epsg:3857 
    })
    .median().setDefaultProjection(PROJ);
    
  return composite;
}
// ------------ Prepare the featurestack(year:2020,2023,2025) -----------------------
var year = 2020;
var spring = seasonalComposite(year, 3, 5).clip(roi);
var summer = seasonalComposite(year, 6, 8).clip(roi);
var autumn = seasonalComposite(year, 9, 11).clip(roi);

function addIndices(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  var evi = image.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'BLUE': image.select('B2')
    }).rename('EVI');
  var ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
  var ndbi = image.normalizedDifference(['B11', 'B8']).rename('NDBI');      // built-up
  var bsi = image.expression(
    '((SWIR+RED)-(NIR+BLUE))/((SWIR+RED)+(NIR+BLUE))', {
      SWIR: image.select('B11'),
      RED:  image.select('B4'),
      NIR:  image.select('B8'),
      BLUE: image.select('B2')
    }).rename('BSI');    //bare land
    var ndmi = image.normalizedDifference(['B8', 'B11']).rename('NDMI');
  return image.addBands([ndvi, evi, ndwi, ndbi, bsi, ndmi]);
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

var spectral = summer.select(['B2','B3','B4','B5','B6','B7','B8A','B8','B11','B12','NDVI','EVI','NDWI','NDBI','BSI','NDMI'])
    .rename(['B2_su','B3_su','B4_su','B5_su','B6_su','B7_su','B8A_su','B8_su','B11_su','B12_su','NDVI_su','EVI_su','NDWI_su','NDBI_su','BSI_su','NDMI_su'])
    .addBands(spring.select(['B2','B3','B4','B8','NDVI','EVI','NDWI','NDMI'])
      .rename(['B2_sp','B3_sp','B4_sp','B8_sp','NDVI_sp','EVI_sp','NDWI_sp','NDMI_sp']))
    .addBands(autumn.select(['B2','B3','B4','B8','NDVI','EVI','NDWI','NDMI'])
      .rename(['B2_au','B3_au','B4_au','B8_au','NDVI_au','EVI_au','NDWI_au','NDMI_au']));

var featurestack = spectral
    .addBands(phenology)
    .addBands(texture)
    .addBands(terrain)
    .clip(roi);

// ------------------ Prepare the training data ------------------------
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

var scale = 20;

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
  [10, 20, 30, 40, 50, 60, 70, 80, 90], // source
  [ 2,  4,  4,  3,  5,  5,  6,  6,  4] // target classes
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

var allSamples = wcSamples.merge(wildAppleSamples);

var sample = featurestack.sampleRegions({
  collection: allSamples,
  properties: ['class'],
  scale: scale,
  tileScale: 4,
  geometries: false
});

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
Map.centerObject(roi, 7);

//Accuracy
var validated = data.validation.classify(classifier);
var confusion = validated.errorMatrix('class', 'classification');
print('Year', year, 'Confusion Matrix', confusion);
print('Year', year, 'Overall Accuracy', confusion.accuracy());
print('Year', year, 'Kappa', confusion.kappa());

// Feature importance
var importance = ee.Dictionary(classifier.explain().get('importance'));
print('Year', year, 'Feature importance', importance);

var palette = ['#b30000', '#00a600', '#f2c649', '#7ab07a', '#8c8c8c', '#3366ff'];
var classNames = ['Wild Apple Forest', 'Other Forest', 'Cropland', 'Grass/Shrub', 'Urban/Bare', 'Water/Snow/Ice'];
Map.addLayer(classified.clip(roi), {min: 1, max: 6, palette: palette}, 'Classification ', false);

// --------------- postprocessing ----------------------
var samplesFC = allSamples;

// bands used for postprocessing
var FEAT = {
  ndvi: 'NDVI_su',
  ndmi: 'NDMI_su',
  ndbi: 'NDBI_su',
  bsi:  'BSI_su'
};

// sampling
var featImg = featurestack.select([FEAT.ndvi, FEAT.ndmi, FEAT.ndbi, FEAT.bsi]);
//print(featImg);
var samp = featImg.sampleRegions({
  collection: samplesFC,
  properties: ['class'],
  //PROJ = EPSG:3857 @ 20m
  scale: 20,
  tileScale: 8,
  geometries: false
}).filter(ee.Filter.notNull([FEAT.ndvi, FEAT.ndmi, FEAT.ndbi, FEAT.bsi, 'class']));

var s1 = samp.filter(ee.Filter.eq('class', 1));

// get band's percentage(return ee.Dictionary：{p40:..., p60:...})
function pctDict(fc, band, ps) {
  return ee.Dictionary(fc.reduceColumns({
    reducer: ee.Reducer.percentile(ps),
    selectors: [band]
  }));
}

// max-low min-high
var P_KEEP_MIN = 60;  // NDVI/NDMI 最低阈值用 class1 的 pxx
var P_KEEP_MAX = 40;  // NDBI/BSI 最高阈值用 class1 的 pxx

var ndviP = pctDict(s1, FEAT.ndvi, [P_KEEP_MIN]);
var ndmiP = pctDict(s1, FEAT.ndmi, [P_KEEP_MIN]);
var ndbiP = pctDict(s1, FEAT.ndbi, [P_KEEP_MAX]);
var bsiP  = pctDict(s1, FEAT.bsi,  [P_KEEP_MAX]);

var T = ee.Dictionary({
  NDVI_min: ee.Number(ndviP.get('p' + P_KEEP_MIN)),
  NDMI_min: ee.Number(ndmiP.get('p' + P_KEEP_MIN)),
  NDBI_max: ee.Number(ndbiP.get('p' + P_KEEP_MAX)),
  BSI_max:  ee.Number(bsiP.get('p' + P_KEEP_MAX))
});

//print('Learned thresholds (strict, from class=1 percentiles):', T);

function postProcessClass1Strict(classified, featurestack, T) {
  var cls = classified.toInt();

  var ndvi = featurestack.select('NDVI_su');
  var ndmi = featurestack.select('NDMI_su');
  var ndbi = featurestack.select('NDBI_su');
  var bsi  = featurestack.select('BSI_su');

  var pred1 = cls.eq(1);

  // rule: V&W\(Builtup&Bareland) → 1
  var keep1 = pred1
    .and(ndvi.gte(ee.Number(T.get('NDVI_min'))))
    .and(ndmi.gte(ee.Number(T.get('NDMI_min'))))
    .and(ndbi.lte(ee.Number(T.get('NDBI_max'))))
    .and(bsi.lte(ee.Number(T.get('BSI_max'))));

  var bad1 = pred1.and(keep1.not());

  // 1 → 5 or → 4
  var urbanLike = pred1.and(
    ndbi.gt(ee.Number(T.get('NDBI_max')))
      .or(bsi.gt(ee.Number(T.get('BSI_max'))))
  );

  var out = cls
    .where(bad1, 4)
    .where(urbanLike, 5)
    .toInt();

  // 小斑块过滤：小于 minPixels 的 class=1 用邻域多数类替换
  var minPixels = 150; // 更少200/300，保留更多50/100
  var mask1 = out.eq(1);
  var count1 = mask1.connectedPixelCount(256, true); // 8邻接
  var small1 = mask1.and(count1.lt(minPixels));

  var majority = out.focal_mode({radius: 1, units: 'pixels'}); // 3x3
  out = out.where(small1, majority).toInt();

  // 轻度多数滤波：平滑class=1
  var mode = out.focal_mode({radius: 1, units: 'pixels'});
  out = out.where(out.eq(1), mode).toInt();

  return out;
}

var classified_post = postProcessClass1Strict(classified, featurestack, T);

var out = classified_post.toInt().clip(roi);

Export.image.toAsset({
  image: out,
  description: 'cls_post_yili_asset_20m',
  assetId: 'users/kindle-400911/demo_cls_post_yili_20m',
  region: roi,
  scale: 20,
  maxPixels: 1e13
});

// var outAsset = ee.Image('projects/kindle-400911/assets/demo_cls_post_yili_20m');

// Export.image.toDrive({
//   image: outAsset,
//   description: 'cls_post_yili_drive_20m',
//   folder: 'GEE_exports',
//   fileNamePrefix: 'cls_post_yili_20m',
//   region: roi,
//   scale: 20,
//   maxPixels: 1e13,
//   fileFormat: 'GeoTIFF',
//   formatOptions: {cloudOptimized: true}
// });


