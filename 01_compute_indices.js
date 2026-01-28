/****
Step 1: Compute seasonal composites + indices + terrain + texture for Ili Kazakh (Xinjiang).
- Exports a feature image to Assets for each year (2020/2023/2025).
- Output asset is consumed by Step 2.
****/

// ----------------------- Region of Interest -----------------------
var admin = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'China'))
  .filter(ee.Filter.eq('ADM1_NAME', 'Xinjiang Uygur Zizhiqu'))
  .filter(ee.Filter.eq('ADM2_NAME', 'Ili Kazakh'));
var roi = admin.geometry();

// Visualization (optional)
var ndviVis = {min: 0, max: 1, palette: ['#d73027', '#fee08b', '#1a9850']};

// ----------------------- Sentinel-2 utilities -----------------------
var s2Sr = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');
var csp = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');

function addCloudScorePlus(image) {
  var score = csp.filter(ee.Filter.eq('system:index', image.get('system:index'))).first();
  var cs = ee.Image(ee.Algorithms.If(score,
    ee.Image(score).select('cs'),
    ee.Image.constant(100)
  )).rename('CSP_CS');
  return image.addBands(cs);
}

function maskClouds(image) {
  var cs = image.select('CSP_CS');
  var mask = cs.lt(50);
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

  return s2.qualityMosaic('NDVI');
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

var srtm = ee.Image('USGS/SRTMGL1_003');
var terrain = ee.Algorithms.Terrain(srtm).select(['elevation', 'slope']);

function buildFeatureStack(year) {
  var spring = seasonalComposite(year, 3, 5);
  var summer = seasonalComposite(year, 6, 8);
  var autumn = seasonalComposite(year, 9, 11);

  var phenology = summer.select('NDVI').rename('NDVI_peak')
    .addBands(summer.select('EVI').rename('EVI_peak'))
    .addBands(spring.select('NDVI').rename('NDVI_spring'))
    .addBands(autumn.select('NDVI').rename('NDVI_autumn'))
    .addBands(summer.select('NDVI').subtract(autumn.select('NDVI')).rename('NDVI_peak_minus_autumn'))
    .addBands(summer.select('NDVI').subtract(spring.select('NDVI')).rename('NDVI_peak_minus_spring'));

  var spectral = summer.select(['B2','B3','B4','B8','NDVI','EVI','NDWI'])
    .rename(['B2_su','B3_su','B4_su','B8_su','NDVI_su','EVI_su','NDWI_su'])
    .addBands(spring.select(['B2','B3','B4','B8','NDVI','EVI','NDWI'])
      .rename(['B2_sp','B3_sp','B4_sp','B8_sp','NDVI_sp','EVI_sp','NDWI_sp']))
    .addBands(autumn.select(['B2','B3','B4','B8','NDVI','EVI','NDWI'])
      .rename(['B2_au','B3_au','B4_au','B8_au','NDVI_au','EVI_au','NDWI_au']));

  var texture = addTexture(summer.select(['NDVI']));

  return spectral.addBands(phenology).addBands(texture).addBands(terrain).clip(roi);
}

var years = [2020, 2023, 2025];

years.forEach(function(year) {
  var featureStack = buildFeatureStack(year);

  // Optional preview
  Map.addLayer(featureStack.select('NDVI').clip(roi), ndviVis, 'NDVI stack ' + year, false);

  Export.image.toAsset({
    image: featureStack,
    description: 'WildApple_Features_' + year,
    assetId: 'users/your_username/wildapple/features_' + year,
    region: roi,
    scale: 10,
    maxPixels: 1e13
  });
});

Map.addLayer(roi, {color: 'red'}, 'ROI', false);
Map.centerObject(roi, 6);
