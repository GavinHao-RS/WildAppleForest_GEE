/****
Example: Wild Apple Forest Classification over Ili Prefecture (Xinjiang, China) using Sentinel-2 and Random Forest
- Years: 2020, 2023, 2025
- Region: Ili Kazakh Autonomous Prefecture (Xinjiang, China) clipped by GAUL level 2 admin boundaries
- Features: spectral, vegetation indices, multi-temporal seasonal composites, terrain, texture
- Cloud handling: Sentinel-2 Harmonized + Cloud Score Plus (CSP) with quality mosaic (NDVI) to avoid .median()
- Outputs: visualization of processed Sentinel-2 composites, indices, texture, and terrain features

****/

// ----------------------- Region of Interest -----------------------
var admin = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'China'))
  .filter(ee.Filter.eq('ADM1_NAME', 'Xinjiang Uygur'))
  .filter(ee.Filter.eq('ADM2_NAME', 'Ili Kazakh Autonomous Prefecture'));
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
var featureStacks = years.map(function(y) { return buildFeatureStack(y); });

// ----------------------- Visualization -----------------------
// Diagnostic layers to visualize intermediate products for a reference year
var previewYear = 2023;
var previewSpring = seasonalComposite(previewYear, 3, 5);
var previewSummer = seasonalComposite(previewYear, 6, 8);
var previewAutumn = seasonalComposite(previewYear, 9, 11);
var previewStack = buildFeatureStack(previewYear);

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

Map.addLayer(roi, {color: 'red'}, 'ROI', false);
Map.centerObject(roi, 5);

// Feature stack previews for all years
featureStacks.forEach(function(img, idx) {
  var year = years[idx];
  Map.addLayer(img.select('NDVI').clip(roi), ndviVis, 'NDVI (feature stack) ' + year, false);
});
