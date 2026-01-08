/****
Step 3: Train Random Forest and classify using feature stacks and sample tables.
- Inputs: feature stacks (Step 1) and training/validation tables (Step 2).
- Outputs: classified maps (Drive exports) and accuracy/feature importance prints.
****/

// ----------------------- Region of Interest -----------------------
var admin = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'China'))
  .filter(ee.Filter.eq('ADM1_NAME', 'Xinjiang Uygur Zizhiqu'))
  .filter(ee.Filter.eq('ADM2_NAME', 'Ili Kazakh'));
var roi = admin.geometry();

var palette = ['#b30000', '#00a600', '#f2c649', '#7ab07a', '#8c8c8c', '#3366ff'];

function classifyYear(year) {
  var features = ee.Image('users/your_username/wildapple/features_' + year);
  var training = ee.FeatureCollection('users/your_username/wildapple/training_' + year);
  var validation = ee.FeatureCollection('users/your_username/wildapple/validation_' + year);

  var bands = features.bandNames();

  var classifier = ee.Classifier.smileRandomForest({
    numberOfTrees: 150,
    variablesPerSplit: 6,
    minLeafPopulation: 2,
    bagFraction: 0.7,
    seed: 42
  }).train({
    features: training,
    classProperty: 'class',
    inputProperties: bands
  });

  var classified = features.classify(classifier).rename('classification');

  var validated = validation.classify(classifier);
  var confusion = validated.errorMatrix('class', 'classification');
  print('Year', year, 'Confusion Matrix', confusion);
  print('Year', year, 'Overall Accuracy', confusion.accuracy());
  print('Year', year, 'Kappa', confusion.kappa());

  var importance = ee.Dictionary(classifier.explain().get('importance'));
  print('Year', year, 'Feature importance', importance);

  Map.addLayer(classified.clip(roi), {min: 1, max: 6, palette: palette}, 'Classification ' + year, false);

  Export.image.toDrive({
    image: classified.toInt(),
    description: 'WildAppleRF_' + year,
    folder: 'GEE_exports',
    fileNamePrefix: 'wildapple_rf_' + year,
    region: roi,
    scale: 10,
    maxPixels: 1e13
  });

  return classified;
}

var years = [2020, 2023, 2025];
var results = years.map(function(year) { return classifyYear(year); });

var compositeComparison = ee.ImageCollection(results)
  .toBands()
  .rename(['class_2020', 'class_2023', 'class_2025']);
Map.addLayer(compositeComparison.clip(roi), {min: 1, max: 6, palette: palette}, 'Comparison (bands per year)', false);

Map.addLayer(roi, {color: 'red'}, 'ROI', false);
Map.centerObject(roi, 6);
