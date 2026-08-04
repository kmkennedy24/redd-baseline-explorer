/**
 * REDD+ Baseline & Additionality Explorer — Acre, Brazil
 * ---------------------------------------------------------
 * Illustrative model of jurisdictional REDD+ baseline deforestation
 * rates and additionality, inspired by (but not a reproduction of)
 * Acre's SISA / ISA-Carbono program.
 *
 * Data sources:
 *   - UMD Hansen Global Forest Change v1.13 (2000-2025)
 *   - FAO GAUL 2015 administrative boundaries
 *   - WHRC Pantropical aboveground biomass density
 *   - INPE PRODES annual deforestation rates (cross-check, external)
 *
 * Run live: https://code.earthengine.google.com/<your-get-link-hash>
 * Full writeup: ../notebooks/acre_redd_analysis.ipynb (or .html)
 *
 * See README.md and REFERENCES.md for methodology notes, limitations,
 * and full citations.
 */

var acreboundary = ee.FeatureCollection("FAO/GAUL/2015/level1")
  .filter(ee.Filter.and(
    ee.Filter.eq('ADM1_NAME', 'Acre')
  ));


var hansen = ee.Image("UMD/hansen/global_forest_change_2025_v1_13");
var hansenAcre = hansen.clip(acreboundary);

Map.centerObject(acreboundary, 7);

// visualizing the deforestation signal
Map.addLayer(hansenAcre.select('lossyear'), {min: 0, max: 25, palette: ['yellow','red']}, 'Acre loss year');
var canopyThreshold = 30; // REDD standard for canopy threshold
var forestMask2000 = hansenAcre.select('treecover2000').gte(canopyThreshold); //baseline for canopy cover, defining pixels
var lossMasked = hansenAcre.select('loss').updateMask(forestMask2000); //defining pixels as loss
var lossyearMasked = hansenAcre.select('lossyear').updateMask(forestMask2000); //masking baseline with loss 

Map.addLayer(forestMask2000.selfMask(), {palette: ['00441b']}, 'Forest mask (>=30% cover, 2000)');
Map.addLayer(lossyearMasked, {min: 0, max: 25, palette: ['yellow','red']}, 'Masked loss year'); //degree of loss from baseline
// area per pixel:
var pixelAreaHa = ee.Number(30).multiply(30).divide(10000);

var lossAreaByYear = lossyearMasked.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(),
  geometry: acreboundary.geometry(),
  scale: 30,
  maxPixels: 1e9
});

var histDict = ee.Dictionary(lossAreaByYear.get('lossyear'));

var lossKeysOnly = histDict.remove(['0'], true); // second arg = ignoreMissing

var years = ee.List(lossKeysOnly.keys()).map(function(k) {
  return ee.Number.parse(k).add(2000);
});
var hectares = ee.List(lossKeysOnly.values()).map(function(count) {
  return ee.Number(count).multiply(pixelAreaHa);
});

var annualLossHa = ee.Dictionary.fromLists(
  years.map(function(y){ return ee.Number(y).format(); }),
  hectares
);
print('Annual forest loss (ha), Acre:', annualLossHa);

// calculating deforestation rate from pre-SISA (2010)
var years = ee.List(annualLossHa.keys()).map(function(k) {
  return ee.Number.parse(k);
});
var values = ee.List(annualLossHa.values());

var lossFeatures = years.zip(values).map(function(pair) {
  pair = ee.List(pair);
  return ee.Feature(null, {
    year: ee.Number(pair.get(0)),
    loss_ha: ee.Number(pair.get(1))
  });
});

var lossFC = ee.FeatureCollection(lossFeatures).sort('year');
print('Annual loss table:', lossFC);
var refFC = lossFC.filter(ee.Filter.and(
  ee.Filter.gte('year', 2001),
  ee.Filter.lte('year', 2009)
));

var flatBaseline = ee.Number(
  refFC.reduceColumns({reducer: ee.Reducer.mean(), selectors: ['loss_ha']}).get('mean')
);
print('Flat baseline (ha/yr):', flatBaseline);

var refFC = lossFC.filter(ee.Filter.and(
  ee.Filter.gte('year', 2001),
  ee.Filter.lte('year', 2009)
));

var flatBaseline = ee.Number(
  refFC.reduceColumns({reducer: ee.Reducer.mean(), selectors: ['loss_ha']}).get('mean')
);
print('Flat baseline (ha/yr):', flatBaseline);
var fit = refFC.reduceColumns({
  reducer: ee.Reducer.linearFit(),
  selectors: ['year', 'loss_ha']
});
var slope = ee.Number(fit.get('scale'));
var intercept = ee.Number(fit.get('offset'));
print('Trend fit — slope:', slope, 'intercept:', intercept);
var projFC = lossFC.filter(ee.Filter.gte('year', 2010)).map(function(f) {
  var yr = ee.Number(f.get('year'));
  var trendVal = yr.multiply(slope).add(intercept);
  return f.set({
    flat_baseline_ha: flatBaseline,
    trend_baseline_ha: trendVal
  });
}).sort('year');

// helper: cumulative sum over a plain ee.List of numbers
function cumulativeSum(list) {
  var cumulative = ee.List(list.iterate(function(current, previous) {
    previous = ee.List(previous);
    var prevTotal = ee.Number(previous.get(-1));
    return previous.add(prevTotal.add(ee.Number(current)));
  }, ee.List([ee.Number(0)])));
  return cumulative.slice(1); // drop the seed 0
}

var projYears        = projFC.aggregate_array('year');
var actualList        = projFC.aggregate_array('loss_ha');
var flatBaselineList  = projFC.aggregate_array('flat_baseline_ha');
var trendBaselineList = projFC.aggregate_array('trend_baseline_ha');

var cumActual = cumulativeSum(actualList);
var cumFlat   = cumulativeSum(flatBaselineList);
var cumTrend  = cumulativeSum(trendBaselineList);

var n = projYears.size();
var indices = ee.List.sequence(0, n.subtract(1));

var cumFeatures = indices.map(function(i) {
  i = ee.Number(i);
  return ee.Feature(null, {
    year: ee.Number(projYears.get(i)),
    cumulative_actual: ee.Number(cumActual.get(i)),
    cumulative_flat_baseline: ee.Number(cumFlat.get(i)),
    cumulative_trend_baseline: ee.Number(cumTrend.get(i))
  });
});

var cumFC = ee.FeatureCollection(cumFeatures);
print('Cumulative trajectories:', cumFC);

var chart = ui.Chart.feature.byFeature({
  features: cumFC,
  xProperty: 'year',
  yProperties: ['cumulative_actual', 'cumulative_flat_baseline', 'cumulative_trend_baseline']
}).setChartType('LineChart')
  .setOptions({
    title: 'Cumulative deforestation: actual vs. baseline counterfactuals (Acre)',
    hAxis: {title: 'Year'},
    vAxis: {title: 'Cumulative hectares lost'},
    series: {
      0: {color: 'red', label: 'Actual'},
      1: {color: 'gray', label: 'Flat baseline'},
      2: {color: 'blue', label: 'Trend baseline'}
    }
  });
print(chart);
// export csv
Export.table.toDrive({
  collection: cumFC,
  description: 'acre_baseline_vs_actual_deforestation',
  fileFormat: 'CSV'
});

// carbon conversion
var biomass = ee.Image("WHRC/biomass/tropical")
var carbonFraction = 0.47;
var co2Ratio = 44 / 12;
var pixelAreaHa = ee.Number(30).multiply(30).divide(10000); // Hansen native res

// Reproject/resample WHRC (500m) onto Hansen's 30m grid isn't necessary for
// reduceRegion — EE handles mismatched scales — but do set scale explicitly.
function actualEmissionsForYear(yearCode) {
  var yearMask = lossyearMasked.eq(yearCode); // yearCode: 1-25 (Hansen's own encoding)
  var biomassAtLoss = biomass.select('Mg').updateMask(yearMask);

  var totalBiomassMg = biomassAtLoss.multiply(ee.Image.pixelArea().divide(10000))
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: acreboundary.geometry(),
      scale: 30,
      maxPixels: 1e9
    }).get('Mg');

  return ee.Number(totalBiomassMg);
}

// Example for one year (code 10 = calendar year 2010)
print('Biomass lost, 2010 (Mg):', actualEmissionsForYear(10));

function biomassToCO2e(biomassMg) {
  return biomassMg.multiply(carbonFraction).multiply(co2Ratio);
}

var meanForestBiomassDensity = ee.Number(
  biomass.select('Mg').updateMask(forestMask2000).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: acreboundary.geometry(),
    scale: 500, // WHRC's native resolution
    maxPixels: 1e9
  }).get('Mg')
);
print('Mean forest biomass density (Mg/ha):', meanForestBiomassDensity);

var avoidedEmissionsFC = cumFC.map(function(f) {
  var avoidedHa = ee.Number(f.get('cumulative_flat_baseline'))
    .subtract(ee.Number(f.get('cumulative_actual')));
  var avoidedBiomassMg = avoidedHa.multiply(meanForestBiomassDensity);
  var avoidedCO2e = avoidedBiomassMg.multiply(carbonFraction).multiply(co2Ratio);
  return f.set('avoided_tCO2e_flat', avoidedCO2e);
});
// Map.addLayer(biomass.select('Mg').clip(acreboundary),
//  {min: 0, max: 350, palette: ['ffffff','fee08b','66a000','004c00']},
//  'WHRC biomass density (Mg/ha)');
//  Map.addLayer(lossyearMasked.eq(10).selfMask(), {palette: ['red']}, '2010 loss pixels');

//additionality
var wedgeChart = ui.Chart.feature.byFeature({
  features: cumFC,
  xProperty: 'year',
  yProperties: ['cumulative_actual', 'cumulative_flat_baseline']
}).setChartType('LineChart')
  .setOptions({
    title: 'Additionality: cumulative avoided deforestation, Acre',
    vAxis: {title: 'Cumulative hectares'},
    series: {0: {color: 'red'}, 1: {color: 'gray'}}
  });
print(wedgeChart);

Export.table.toDrive({
  collection: cumFC,
  description: 'acre_additionality_wedge',
  fileFormat: 'CSV'
});
// Restrict the buffer to Brazilian territory so you're not mixing in
// Peru/Bolivia dynamics, which have different land-use drivers/data quality
var brazil = ee.FeatureCollection("FAO/GAUL/2015/level1")
  .filter(ee.Filter.eq('ADM0_NAME', 'Brazil'));

var acreGeom = acreboundary.geometry();
var bufferDistanceM = 50000; // 50 km — a defensible, round starting choice

var bufferRing = acreGeom.buffer(bufferDistanceM)
  .difference(acreGeom)
  .intersection(brazil.geometry(), 1);

Map.addLayer(bufferRing, {color: 'orange'}, 'Leakage buffer (50km ring, Brazil only)');
var forestMaskFull = hansen.select('treecover2000').gte(30);
var lossyearFull = hansen.select('lossyear').updateMask(forestMaskFull);

var bufferHist = lossyearFull.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(),
  geometry: bufferRing,
  scale: 30,
  maxPixels: 1e9
});

var bufferDict = ee.Dictionary(bufferHist.get('lossyear')).remove(['0'], true);
var bufferYears = ee.List(bufferDict.keys()).map(function(k){ return ee.Number.parse(k).add(2000); });
var bufferHa = ee.List(bufferDict.values()).map(function(c){ return ee.Number(c).multiply(pixelAreaHa); });

var bufferFC = ee.FeatureCollection(
  bufferYears.zip(bufferHa).map(function(p) {
    p = ee.List(p);
    return ee.Feature(null, {year: p.get(0), buffer_loss_ha: p.get(1)});
  })
).sort('year');
var joined = lossFC.map(function(f) {
  var yr = f.get('year');
  var matchBuffer = bufferFC.filter(ee.Filter.eq('year', yr)).first();
  return f.set('buffer_loss_ha', matchBuffer.get('buffer_loss_ha'));
});

print(ui.Chart.feature.byFeature({
  features: joined,
  xProperty: 'year',
  yProperties: ['loss_ha', 'buffer_loss_ha']
}).setChartType('LineChart').setOptions({
  title: 'Acre (inside) vs. 50km buffer (outside) annual forest loss',
  series: {0: {color: 'red', label: 'Acre'}, 1: {color: 'orange', label: 'Buffer'}}
}));